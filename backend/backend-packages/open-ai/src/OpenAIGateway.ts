import { AxiosError } from 'axios';
import { injectable } from 'inversify';
import {
    ChatCompletionRequestMessage,
    Configuration,
    CreateChatCompletionRequest,
    CreateCompletionRequest,
    CreateCompletionResponse,
    OpenAIApi,
} from 'openai';

import { FeatureToggle } from '@spinach-shared/types';

import { getConfigValue } from '@spinach-backend/constants';
import { FeatureToggleStore } from '@spinach-backend/feature-toggle';
import { backendLogger } from '@spinach-backend/logging';
import { EmbeddingResults, GenerationResults, OpenAIModels } from '@spinach-backend/types';

import { ChatCompletionGateway } from './ChatCompletionGateway';
import { OpenAIAdapter } from './OpenAIAdapter';
import { OpenAIMetricsService } from './OpenAIMetricsService';
import { DEFAULT_OVERRIDES, getMaxTokensForModel } from './shared';

@injectable()
export class OpenAIGateway implements ChatCompletionGateway {
    private readonly apiKeys: string[];
    private readonly openAiApis: OpenAIApi[];

    constructor(private readonly adapter: OpenAIAdapter, private readonly openAIMetricsService: OpenAIMetricsService) {
        this.apiKeys = getConfigValue('OPENAI_API_KEY').replaceAll(' ', '').split(',');
        const configurations = this.apiKeys.map((apiKey) => new Configuration({ apiKey }));
        this.openAiApis = configurations.map((config) => new OpenAIApi(config));
        backendLogger.info('OpenAIGateway initialized', { apiKeyCount: this.apiKeys.length });
    }

    async generateChatCompletion(
        prompt: string,
        overrides: Partial<Omit<CreateChatCompletionRequest, 'messages'>> = {}
    ): Promise<GenerationResults | null> {
        const request = this.adapter.getPromptRequest(prompt);
        const response = await this.chatCompletion(request, {
            temperature: 1,
            ...DEFAULT_OVERRIDES,
            ...overrides,
        });
        const results = this.adapter.getGenerationResults(response);
        return results;
    }

    async chatCompletion(
        messages: ChatCompletionRequestMessage[],
        overrides?: Omit<CreateChatCompletionRequest, 'model' | 'messages'> & {
            model?: CreateChatCompletionRequest['model'];
        }
    ) {
        const model = await FeatureToggleStore.fetchScribeFeature(FeatureToggle.OpenAiModel, OpenAIModels.GPT4_32K);
        const determinedModel = overrides?.model ?? model;

        return await this.executeWithAccountFallbacks(async (api, openAiAccountUsed) => {
            const startTime = new Date().getTime();
            const chatCompletion = await api.createChatCompletion({
                model,
                messages,
                ...overrides,
                max_tokens: getMaxTokensForModel(determinedModel),
            });
            const endTime = new Date().getTime();
            const totalTimeInSeconds = (endTime - startTime) / 1000;
            this.openAIMetricsService.openAIRequestTime({
                model,
                time: totalTimeInSeconds,
                openAiAccount: openAiAccountUsed,
            });

            if (!chatCompletion.data.choices.length) {
                return null;
            }

            return { data: chatCompletion.data, openAiAccountUsed };
        });
    }

    /** @deprecated this was used for older GPT APIs/Models. Prefer `generate` or the lower-level `chatCompletion` */
    async completion(
        prompt: string,
        overrides?: Omit<CreateCompletionRequest, 'model'> & { model?: CreateCompletionRequest['model'] }
    ): Promise<CreateCompletionResponse | null> {
        const model = await FeatureToggleStore.fetchScribeFeature(FeatureToggle.OpenAiModel, OpenAIModels.GPT4_32K);

        return await this.executeWithAccountFallbacks(async (api) => {
            const completion = await api.createCompletion({
                model,
                prompt,
                ...overrides,
                max_tokens: getMaxTokensForModel(model),
            });

            if (!completion.data.choices.length) {
                return null;
            }
            return completion.data;
        });
    }

    async createEmbedding(rawQuery: string): Promise<EmbeddingResults> {
        return await this.executeWithAccountFallbacks(async (api, openAiAccountUsed) => {
            const res = await api.createEmbedding({
                model: OpenAIModels.EmbeddingAda2,
                input: rawQuery,
            });

            return this.adapter.getEmbeddingResults({ data: res.data, openAiAccountUsed });
        });
    }

    private async executeWithAccountFallbacks<T>(
        execution: (api: OpenAIApi, openAiAccountUsed: string) => Promise<T>
    ): Promise<T> {
        let accountAttempt = 0;
        for (const api of this.openAiApis) {
            accountAttempt++;
            try {
                const apiKeyIndex = accountAttempt - 1;
                const openAiApiKeySuffix = this.apiKeys[apiKeyIndex].slice(-4);

                return await execution(api, openAiApiKeySuffix);
            } catch (error) {
                const axiosError = error as AxiosError;
                if (axiosError.response?.status === 400) {
                    throw error;
                }

                if (accountAttempt === this.openAiApis.length) {
                    throw error;
                }
            }
        }

        // This should not be reached -- we should either return or throw a more specific error in the final catch.
        throw new Error('Failed to executeForAllAccounts');
    }
}
