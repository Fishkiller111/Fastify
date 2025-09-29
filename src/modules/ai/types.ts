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

// Mastra Agent Tool 类型
export interface AgentTool {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

// Mastra Agent Prompt 配置
export interface AgentPromptConfig {
  id: string;
  name: string;
  instructions: string;
  systemPrompt?: string;
  userPrompt?: string;
}

// RAG 数据库配置
export type RAGDatabaseType = 'none' | 'vector' | 'embedding' | 'custom';

export interface RAGConfig {
  type: RAGDatabaseType;
  enabled: boolean;
  vectorStore?: {
    provider: string;
    apiKey: string;
    indexName: string;
  };
  embeddingModel?: {
    provider: AIProvider;
    model: string;
  };
}

// Mastra Agent 配置
export interface MastraAgentConfig {
  id: string;
  name: string;
  description?: string;
  aiProvider: AIProvider;
  model: string;
  promptConfig: AgentPromptConfig;
  tools: AgentTool[];
  ragConfig: RAGConfig;
  modelSettings: {
    temperature: number;
    maxTokens: number;
    topP?: number;
    topK?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
  };
  memory?: {
    enabled: boolean;
    threadId?: string;
    resourceId?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  createdBy: number;
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

// Agent 会话类型
export interface AgentSession {
  id: string;
  agentId: string;
  userId: number;
  title: string;
  status: 'active' | 'archived' | 'deleted';
  createdAt: Date;
  updatedAt: Date;
}

// 会话消息类型
export interface SessionMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// 创建会话请求
export interface CreateSessionRequest {
  agentId: string;
  title?: string;
}

// 更新会话请求
export interface UpdateSessionRequest {
  title?: string;
  status?: 'active' | 'archived' | 'deleted';
}

// 发送消息请求
export interface SendMessageRequest {
  content: string;
  metadata?: Record<string, any>;
}

// 流式响应数据类型
export interface StreamChunk {
  id: string;
  type: 'message' | 'delta' | 'done' | 'error';
  content?: string;
  delta?: string;
  metadata?: Record<string, any>;
  error?: string;
}