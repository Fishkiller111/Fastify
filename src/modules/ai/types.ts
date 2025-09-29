// AI服务提供商类型
export type AIProvider = 'openai' | 'claude' | 'openrouter';

// AI配置接口
export interface AIConfig {
  provider: AIProvider;
  openai: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  claude: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  openrouter: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  maxTokens: number;
  temperature: number;
}

// 聊天消息接口
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// AI请求接口
export interface AIRequest {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

// AI响应接口
export interface AIResponse {
  content: string;
  model: string;
  provider: AIProvider;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// AI服务接口
export interface IAIService {
  chat(request: AIRequest): Promise<AIResponse>;
}