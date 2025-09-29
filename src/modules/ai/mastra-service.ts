import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import config from '../../config/index.js';
import type {
  MastraAgentConfig,
  AIConfig,
  StreamChunk
} from './types.js';

export class MastraService {
  private aiConfig: AIConfig;

  constructor() {
    this.aiConfig = config.ai;
  }

  // 创建Mastra Agent实例
  createAgent(agentConfig: MastraAgentConfig): Agent {
    // 根据配置选择模型
    const model = this.getModel(agentConfig.aiProvider, agentConfig.model);

    // 创建工具集
    const tools = this.createTools(agentConfig.tools);

    // 创建Agent
    const agent = new Agent({
      name: agentConfig.name,
      instructions: this.buildInstructions(agentConfig),
      model: model,
      tools: tools
    });

    return agent;
  }

  // 获取模型提供商
  private getModel(provider: string, modelName: string) {
    switch (provider) {
      case 'openai':
        return openai(modelName as any);

      case 'claude':
        return anthropic(modelName as any);

      default:
        throw new Error(`不支持的AI提供商: ${provider}`);
    }
  }

  // 构建指令
  private buildInstructions(agentConfig: MastraAgentConfig): string {
    let instructions = '';

    // 添加系统提示
    if (agentConfig.promptConfig.systemPrompt) {
      instructions += agentConfig.promptConfig.systemPrompt + '\n\n';
    }

    // 添加主要指令
    if (agentConfig.promptConfig.instructions) {
      instructions += agentConfig.promptConfig.instructions + '\n\n';
    }

    // 添加用户提示模板
    if (agentConfig.promptConfig.userPrompt) {
      instructions += `用户消息格式: ${agentConfig.promptConfig.userPrompt}\n\n`;
    }

    return instructions.trim() || `你是${agentConfig.name}，一个智能助手。请帮助用户解决问题。`;
  }

  // 创建工具集
  private createTools(toolsConfig: any[]) {
    const tools: Record<string, any> = {};

    for (const toolConfig of toolsConfig) {
      if (!toolConfig.enabled) continue;

      // 创建基础工具
      const tool = createTool({
        id: toolConfig.id,
        description: toolConfig.description,
        inputSchema: z.object({
          query: z.string().describe('用户查询内容')
        }),
        execute: async ({ context }: { context: any }) => {
          // 这里可以根据工具类型实现具体逻辑
          return {
            result: `工具 ${toolConfig.name} 执行结果: ${context.query}`
          };
        }
      });

      tools[toolConfig.id] = tool;
    }

    return tools;
  }


  // 流式聊天
  async streamChat(
    agent: Agent,
    message: string,
    options: {
      sessionId?: string;
      threadId?: string;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<AsyncIterableIterator<StreamChunk>> {
    const streamOptions: any = {
      temperature: options.temperature || 0.7,
      maxSteps: 3
    };

    // 如果有会话信息，添加内存配置
    if (options.sessionId || options.threadId) {
      streamOptions.memory = {
        thread: options.threadId || options.sessionId,
        resource: 'chat-session'
      };
    }

    try {
      const response = await agent.stream(message, streamOptions);

      return this.createStreamIterator(response);
    } catch (error) {
      console.error('Mastra streaming error:', error);
      throw new Error('Agent响应失败');
    }
  }

  // 创建流迭代器
  private async *createStreamIterator(response: any): AsyncIterableIterator<StreamChunk> {
    const responseId = `resp_${Date.now()}`;
    let accumulatedContent = '';

    try {
      // 发送开始消息
      yield {
        id: responseId,
        type: 'message',
        content: '正在思考...',
        metadata: { status: 'processing' }
      };

      // 处理文本流
      if (response.textStream) {
        for await (const chunk of response.textStream) {
          accumulatedContent += chunk;

          yield {
            id: responseId,
            type: 'delta',
            delta: chunk,
            content: accumulatedContent,
            metadata: { status: 'streaming' }
          };
        }
      }

      // 等待完整响应
      const fullText = await response.text;
      const usage = await response.usage;
      const finishReason = await response.finishReason;
      const toolCalls = await response.toolCalls;

      // 发送完成消息
      yield {
        id: responseId,
        type: 'done',
        content: fullText || accumulatedContent,
        metadata: {
          status: 'completed',
          usage: usage,
          finishReason: finishReason,
          toolCalls: toolCalls?.length || 0
        }
      };

    } catch (error: any) {
      console.error('Stream processing error:', error);

      yield {
        id: responseId,
        type: 'error',
        error: '处理响应时发生错误',
        metadata: {
          error: error.message,
          status: 'failed'
        }
      };
    }
  }

  // 生成单次响应（非流式）
  async generateResponse(
    agent: Agent,
    message: string,
    options: {
      sessionId?: string;
      threadId?: string;
      temperature?: number;
    } = {}
  ): Promise<{
    content: string;
    usage?: any;
    toolCalls?: any[];
  }> {
    const generateOptions: any = {
      temperature: options.temperature || 0.7,
      maxSteps: 3
    };

    // 如果有会话信息，添加内存配置
    if (options.sessionId || options.threadId) {
      generateOptions.memory = {
        thread: options.threadId || options.sessionId,
        resource: 'chat-session'
      };
    }

    try {
      const response = await agent.generate(message, generateOptions);

      return {
        content: response.text,
        usage: response.usage,
        toolCalls: response.toolCalls
      };
    } catch (error) {
      console.error('Mastra generation error:', error);
      throw new Error('Agent响应失败');
    }
  }

  // 验证Agent配置
  validateAgentConfig(agentConfig: MastraAgentConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 验证基本配置
    if (!agentConfig.name?.trim()) {
      errors.push('Agent名称不能为空');
    }

    if (!agentConfig.aiProvider) {
      errors.push('必须选择AI提供商');
    } else if (!['openai', 'claude'].includes(agentConfig.aiProvider)) {
      errors.push('不支持的AI提供商');
    }

    if (!agentConfig.model?.trim()) {
      errors.push('必须选择模型');
    }

    // 验证提示配置
    if (!agentConfig.promptConfig?.instructions?.trim()) {
      errors.push('Agent指令不能为空');
    }

    // 验证模型设置
    const { temperature, maxTokens } = agentConfig.modelSettings;
    if (temperature < 0 || temperature > 2) {
      errors.push('temperature必须在0-2之间');
    }

    if (maxTokens < 1 || maxTokens > 100000) {
      errors.push('maxTokens必须在1-100000之间');
    }

    // 验证工具配置
    if (agentConfig.tools?.length > 0) {
      for (const tool of agentConfig.tools) {
        if (!tool.id?.trim()) {
          errors.push('工具ID不能为空');
        }
        if (!tool.name?.trim()) {
          errors.push('工具名称不能为空');
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export const mastraService = new MastraService();