import { ChatCompletions } from '@azure/openai';
import { injectable } from 'inversify';
import { ChatCompletionRequestMessage, CreateChatCompletionResponse, CreateEmbeddingResponse } from 'openai';

import { EmbeddingResults, GenerationResults, OpenAIChatRole, OpenAIEndpoint } from '@spinach-backend/types';

@injectable()
export class OpenAIAdapter {
    getPromptRequest(prompt: string) {
        const request: ChatCompletionRequestMessage[] = [
            {
                role: OpenAIChatRole.User,
                content: prompt,
            },
        ];

        return request;
    }

    getGenerationResults(
        response: { data: CreateChatCompletionResponse; openAiAccountUsed: string } | null
    ): GenerationResults | null {
        const { data, openAiAccountUsed } = response ?? {};
        if (data?.choices[0]?.message?.content) {
            return {
                output: data.choices[0].message.content,
                promptTokenUsage: data.usage?.prompt_tokens ?? 0,
                tokenUsage: data.usage?.total_tokens ?? 0,
                model: data.model,
                openAiAccountUsed,
            };
        }

        return null;
    }

    getGenerationResultsFromAzure(
        response: ChatCompletions & { model: string; endpoint: OpenAIEndpoint }
    ): GenerationResults | null {
        if (response?.choices[0]?.message?.content) {
            return {
                output: response.choices[0].message.content,
                promptTokenUsage: response.usage?.promptTokens ?? 0,
                tokenUsage: response.usage?.totalTokens ?? 0,
                model: response.model,
                openAiAccountUsed: 'azure',
                endpoint: response.endpoint,
            };
        }

        return null;
    }

    getEmbeddingResults(response: { data: CreateEmbeddingResponse; openAiAccountUsed: string }): EmbeddingResults {
        const { data, openAiAccountUsed } = response;
        return {
            embedding: data.data[0].embedding,
            promptTokenUsage: data.usage.prompt_tokens,
            tokenUsage: data.usage.total_tokens,
            model: data.model,
            openAiAccountUsed,
        };
    }
}
