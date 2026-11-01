import { GetChatCompletionsOptions } from '@azure/openai';
import { CreateChatCompletionRequest } from 'openai';

import { OpenAIModels } from '@spinach-backend/types';

export const DEFAULT_OVERRIDES: Partial<CreateChatCompletionRequest> = {
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    max_tokens: 4000,
};

export const DEFAULT_AZURE_OVERRIDES: Partial<GetChatCompletionsOptions> = {
    topP: DEFAULT_OVERRIDES.top_p ?? undefined,
    frequencyPenalty: DEFAULT_OVERRIDES.frequency_penalty ?? undefined,
    presencePenalty: DEFAULT_OVERRIDES.presence_penalty ?? undefined,
    maxTokens: DEFAULT_OVERRIDES.max_tokens,
};

/** returns the limit of completion/output tokens that may be used for a generation */
export function getMaxTokensForModel(model: string): number {
    if (model === OpenAIModels.GPT4_32K) {
        return 6000;
    }

    if (model === OpenAIModels.GPT4_128K) {
        // NOTE - today, this value is actualy capped to 4k on openai's side
        return 4000;
    }

    return 2000;
}
