import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { aiConfigService } from './config-service.js';
import { AIRequest, AIResponse, IAIService, ChatMessage } from './types.js';

// OpenAI服务实现
class OpenAIService implements IAIService {
  private client: OpenAI | null = null;

  private async getClient(): Promise<OpenAI> {
    if (!this.client) {
      const config = await aiConfigService.getAIConfig();
      this.client = new OpenAI({
        apiKey: config.openai.apiKey,
        baseURL: config.openai.baseUrl,
      });
    }
    return this.client;
  }

  async chat(request: AIRequest): Promise<AIResponse> {
    const client = await this.getClient();
    const config = await aiConfigService.getAIConfig();

    try {
      const response = await client.chat.completions.create({
        model: request.model || config.openai.model,
        messages: request.messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        max_tokens: request.maxTokens || config.maxTokens,
        temperature: request.temperature || config.temperature,
      });

      const choice = response.choices[0];
      if (!choice || !choice.message?.content) {
        throw new Error('OpenAI API返回了空响应');
      }

      return {
        content: choice.message.content,
        model: response.model,
        provider: 'openai',
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
      };
    } catch (error: any) {
      throw new Error(`OpenAI API调用失败: ${error.message}`);
    }
  }
}

// Claude服务实现
class ClaudeService implements IAIService {
  private client: Anthropic | null = null;

  private async getClient(): Promise<Anthropic> {
    if (!this.client) {
      const config = await aiConfigService.getAIConfig();
      this.client = new Anthropic({
        apiKey: config.claude.apiKey,
        baseURL: config.claude.baseUrl,
      });
    }
    return this.client;
  }

  async chat(request: AIRequest): Promise<AIResponse> {
    const client = await this.getClient();
    const config = await aiConfigService.getAIConfig();

    try {
      // 分离系统消息和用户消息
      const systemMessages = request.messages.filter(msg => msg.role === 'system');
      const chatMessages = request.messages.filter(msg => msg.role !== 'system');

      const systemPrompt = systemMessages.map(msg => msg.content).join('\n');

      const response = await client.messages.create({
        model: request.model || config.claude.model,
        max_tokens: request.maxTokens || config.maxTokens,
        temperature: request.temperature || config.temperature,
        system: systemPrompt || undefined,
        messages: chatMessages.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        })),
      });

      const content = response.content[0];
      if (!content || content.type !== 'text') {
        throw new Error('Claude API返回了非文本响应');
      }

      return {
        content: content.text,
        model: response.model,
        provider: 'claude',
        usage: response.usage ? {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        } : undefined,
      };
    } catch (error: any) {
      throw new Error(`Claude API调用失败: ${error.message}`);
    }
  }
}

// OpenRouter服务实现
class OpenRouterService implements IAIService {
  async chat(request: AIRequest): Promise<AIResponse> {
    const config = await aiConfigService.getAIConfig();

    try {
      const response = await axios.post(`${config.openrouter.baseUrl}/chat/completions`, {
        model: request.model || config.openrouter.model,
        messages: request.messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        max_tokens: request.maxTokens || config.maxTokens,
        temperature: request.temperature || config.temperature,
      }, {
        headers: {
          'Authorization': `Bearer ${config.openrouter.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://localhost',
          'X-Title': 'Fastify AI App',
        },
      });

      const choice = response.data.choices[0];
      if (!choice || !choice.message?.content) {
        throw new Error('OpenRouter API返回了空响应');
      }

      return {
        content: choice.message.content,
        model: response.data.model || request.model || config.openrouter.model,
        provider: 'openrouter',
        usage: response.data.usage ? {
          promptTokens: response.data.usage.prompt_tokens,
          completionTokens: response.data.usage.completion_tokens,
          totalTokens: response.data.usage.total_tokens,
        } : undefined,
      };
    } catch (error: any) {
      const message = error.response?.data?.error?.message || error.message;
      throw new Error(`OpenRouter API调用失败: ${message}`);
    }
  }
}

// AI服务管理器
export class AIService {
  private openaiService = new OpenAIService();
  private claudeService = new ClaudeService();
  private openrouterService = new OpenRouterService();

  // 根据配置选择服务提供商
  private async getService(): Promise<IAIService> {
    const config = await aiConfigService.getAIConfig();
    const provider = config.provider;

    let currentModel = '';
    switch (provider) {
      case 'openai':
        currentModel = config.openai.model;
        console.log(`🤖 使用AI提供商: ${provider.toUpperCase()} | 模型: ${currentModel} | 基础URL: ${config.openai.baseUrl}`);
        return this.openaiService;
      case 'claude':
        currentModel = config.claude.model;
        console.log(`🤖 使用AI提供商: ${provider.toUpperCase()} | 模型: ${currentModel} | 基础URL: ${config.claude.baseUrl}`);
        return this.claudeService;
      case 'openrouter':
        currentModel = config.openrouter.model;
        console.log(`🤖 使用AI提供商: ${provider.toUpperCase()} | 模型: ${currentModel} | 基础URL: ${config.openrouter.baseUrl}`);
        return this.openrouterService;
      default:
        throw new Error(`不支持的AI提供商: ${provider}`);
    }
  }

  // 发送聊天请求
  async chat(request: AIRequest): Promise<AIResponse> {
    const service = await this.getService();
    return await service.chat(request);
  }

  // 简单的文本补全方法
  async complete(prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string> {
    const request: AIRequest = {
      messages: [{ role: 'user', content: prompt }],
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
    };

    const response = await this.chat(request);
    return response.content;
  }

  // 测试AI服务连接
  async testConnection(): Promise<{ success: boolean; provider: string; model: string; error?: string }> {
    try {
      const config = await aiConfigService.getAIConfig();
      const provider = config.provider;

      let currentModel = '';
      switch (provider) {
        case 'openai':
          currentModel = config.openai.model;
          break;
        case 'claude':
          currentModel = config.claude.model;
          break;
        case 'openrouter':
          currentModel = config.openrouter.model;
          break;
      }

      console.log(`🔍 测试AI连接 - 提供商: ${provider.toUpperCase()} | 模型: ${currentModel}`);
      const response = await this.complete('测试消息：请回复"连接成功"', { maxTokens: 10 });
      console.log(`✅ AI连接测试成功 - ${provider.toUpperCase()}`);

      return {
        success: true,
        provider,
        model: currentModel,
        // error: undefined
      };
    } catch (error: any) {
      const config = await aiConfigService.getAIConfig();
      const provider = config.provider;
      let currentModel = '';
      switch (provider) {
        case 'openai':
          currentModel = config.openai.model;
          break;
        case 'claude':
          currentModel = config.claude.model;
          break;
        case 'openrouter':
          currentModel = config.openrouter.model;
          break;
      }

      console.log(`❌ AI连接测试失败 - ${provider.toUpperCase()}: ${error.message}`);
      return {
        success: false,
        provider,
        model: currentModel,
        error: error.message,
      };
    }
  }
}

// 导出单例实例
export const aiService = new AIService();