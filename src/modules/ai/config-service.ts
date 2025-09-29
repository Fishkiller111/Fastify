import { getConfigByKey, setConfig } from '../config/service.js';
import { AIConfig, AIProvider } from './types.js';

// AI配置服务类
export class AIConfigService {
  private configCache: Partial<AIConfig> = {};
  private cacheExpiry: number = 0;
  private cacheTTL = 5 * 60 * 1000; // 5分钟缓存

  // 获取完整AI配置
  async getAIConfig(): Promise<AIConfig> {
    if (this.isCacheValid()) {
      return this.configCache as AIConfig;
    }

    const config: AIConfig = {
      provider: await this.getProvider(),
      openai: {
        apiKey: await this.getConfigValue('openai_api_key', ''),
        baseUrl: await this.getConfigValue('openai_base_url', 'https://api.openai.com/v1'),
        model: await this.getConfigValue('openai_model', 'gpt-3.5-turbo'),
      },
      claude: {
        apiKey: await this.getConfigValue('claude_api_key', ''),
        baseUrl: await this.getConfigValue('claude_base_url', 'https://api.anthropic.com'),
        model: await this.getConfigValue('claude_model', 'claude-3-sonnet-20240229'),
      },
      openrouter: {
        apiKey: await this.getConfigValue('openrouter_api_key', ''),
        baseUrl: await this.getConfigValue('openrouter_base_url', 'https://openrouter.ai/api/v1'),
        model: await this.getConfigValue('openrouter_model', 'anthropic/claude-3-sonnet'),
      },
      maxTokens: parseInt(await this.getConfigValue('ai_max_tokens', '1000')),
      temperature: parseFloat(await this.getConfigValue('ai_temperature', '0.7')),
    };

    // 更新缓存
    this.configCache = config;
    this.cacheExpiry = Date.now() + this.cacheTTL;

    return config;
  }

  // 获取当前AI提供商
  async getProvider(): Promise<AIProvider> {
    const provider = await this.getConfigValue('ai_provider', 'openai');
    if (['openai', 'claude', 'openrouter'].includes(provider)) {
      return provider as AIProvider;
    }
    return 'openai';
  }

  // 设置AI提供商
  async setProvider(provider: AIProvider): Promise<void> {
    await setConfig({
      key: 'ai_provider',
      value: provider,
      description: '当前使用的AI服务提供商'
    });
    this.invalidateCache();
  }

  // 设置OpenAI配置
  async setOpenAIConfig(config: { apiKey?: string; model?: string; baseUrl?: string }): Promise<void> {
    const updates = [];

    if (config.apiKey !== undefined) {
      updates.push(setConfig({
        key: 'openai_api_key',
        value: config.apiKey,
        description: 'OpenAI API密钥'
      }));
    }

    if (config.model !== undefined) {
      updates.push(setConfig({
        key: 'openai_model',
        value: config.model,
        description: 'OpenAI使用的模型'
      }));
    }

    if (config.baseUrl !== undefined) {
      updates.push(setConfig({
        key: 'openai_base_url',
        value: config.baseUrl,
        description: 'OpenAI API基础URL'
      }));
    }

    await Promise.all(updates);
    this.invalidateCache();
  }

  // 设置Claude配置
  async setClaudeConfig(config: { apiKey?: string; model?: string; baseUrl?: string }): Promise<void> {
    const updates = [];

    if (config.apiKey !== undefined) {
      updates.push(setConfig({
        key: 'claude_api_key',
        value: config.apiKey,
        description: 'Claude API密钥'
      }));
    }

    if (config.model !== undefined) {
      updates.push(setConfig({
        key: 'claude_model',
        value: config.model,
        description: 'Claude使用的模型'
      }));
    }

    if (config.baseUrl !== undefined) {
      updates.push(setConfig({
        key: 'claude_base_url',
        value: config.baseUrl,
        description: 'Claude API基础URL'
      }));
    }

    await Promise.all(updates);
    this.invalidateCache();
  }

  // 设置OpenRouter配置
  async setOpenRouterConfig(config: { apiKey?: string; model?: string; baseUrl?: string }): Promise<void> {
    const updates = [];

    if (config.apiKey !== undefined) {
      updates.push(setConfig({
        key: 'openrouter_api_key',
        value: config.apiKey,
        description: 'OpenRouter API密钥'
      }));
    }

    if (config.model !== undefined) {
      updates.push(setConfig({
        key: 'openrouter_model',
        value: config.model,
        description: 'OpenRouter使用的模型'
      }));
    }

    if (config.baseUrl !== undefined) {
      updates.push(setConfig({
        key: 'openrouter_base_url',
        value: config.baseUrl,
        description: 'OpenRouter API基础URL'
      }));
    }

    await Promise.all(updates);
    this.invalidateCache();
  }

  // 设置通用AI参数
  async setAIParams(params: { maxTokens?: number; temperature?: number }): Promise<void> {
    const updates = [];

    if (params.maxTokens !== undefined) {
      updates.push(setConfig({
        key: 'ai_max_tokens',
        value: params.maxTokens.toString(),
        description: 'AI响应的最大token数'
      }));
    }

    if (params.temperature !== undefined) {
      updates.push(setConfig({
        key: 'ai_temperature',
        value: params.temperature.toString(),
        description: 'AI响应的温度设置'
      }));
    }

    await Promise.all(updates);
    this.invalidateCache();
  }

  // 私有方法：获取配置值
  private async getConfigValue(key: string, defaultValue: string): Promise<string> {
    try {
      const config = await getConfigByKey(key);
      return config?.value || defaultValue;
    } catch (error) {
      console.warn(`获取配置 ${key} 失败，使用默认值:`, error);
      return defaultValue;
    }
  }

  // 私有方法：检查缓存是否有效
  private isCacheValid(): boolean {
    return Object.keys(this.configCache).length > 0 && Date.now() < this.cacheExpiry;
  }

  // 私有方法：清除缓存
  private invalidateCache(): void {
    this.configCache = {};
    this.cacheExpiry = 0;
  }
}

// 导出单例实例
export const aiConfigService = new AIConfigService();