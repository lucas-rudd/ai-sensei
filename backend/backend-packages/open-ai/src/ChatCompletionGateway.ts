import { CreateChatCompletionRequest } from 'openai';

import { GenerationResults, OpenAIEndpoint } from '@spinach-backend/types';

export interface ChatCompletionGateway {
    generateChatCompletion(
        prompt: string,
        overrides: Partial<Omit<CreateChatCompletionRequest, 'messages'>>,
        endpoint?: OpenAIEndpoint
    ): Promise<GenerationResults | null>;
}
