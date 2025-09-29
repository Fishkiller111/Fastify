#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question, defaultValue = '') {
  return new Promise((resolve) => {
    const displayDefault = defaultValue ? ` (${defaultValue})` : '';
    rl.question(`${question}${displayDefault}: `, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

function replaceInFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  文件 ${filePath} 不存在，跳过`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');

  for (const [key, value] of Object.entries(replacements)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    content = content.replace(regex, value);
  }

  fs.writeFileSync(filePath, content);
  console.log(`✅ 已更新 ${filePath}`);
}

async function setupProject() {
  console.log('🚀 Fastify TypeScript API 模板设置向导');
  console.log('='.repeat(50));

  try {
    // 收集项目信息
    const projectName = await prompt('项目名称', 'my-fastify-api');
    const projectDescription = await prompt('项目描述', 'Fastify TypeScript API项目');
    const authorName = await prompt('作者姓名', 'Your Name');
    const authorEmail = await prompt('作者邮箱', 'your.email@example.com');
    const databaseName = await prompt('数据库名称', `${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_db`);
    const serverPort = await prompt('服务器端口', '3000');

    const replacements = {
      projectName,
      projectDescription,
      authorName,
      authorEmail,
      databaseName,
      serverPort
    };

    console.log('\n📝 正在配置项目文件...');

    // 更新 package.json
    const packageJsonPath = path.join(__dirname, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      packageJson.name = projectName;
      packageJson.description = projectDescription;
      packageJson.author = {
        name: authorName,
        email: authorEmail
      };
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      console.log('✅ 已更新 package.json');
    }

    // 创建 .env 文件
    const envTemplatePath = path.join(__dirname, '.env.template');
    const envPath = path.join(__dirname, '.env');

    if (fs.existsSync(envTemplatePath)) {
      replaceInFile(envTemplatePath, replacements);
      fs.copyFileSync(envTemplatePath, envPath);
      console.log('✅ 已创建 .env 文件');
    }

    // 更新 README.md（如果存在）
    const readmePath = path.join(__dirname, 'README.md');
    if (fs.existsSync(readmePath)) {
      replaceInFile(readmePath, replacements);
    }

    console.log('\n🎉 项目设置完成！');
    console.log('\n📋 下一步操作：');
    console.log('1. 配置 .env 文件中的数据库连接信息');
    console.log('2. 确保 PostgreSQL 数据库正在运行');
    console.log('3. 运行 npm install 安装依赖');
    console.log('4. 运行 npm run build 编译项目');
    console.log('5. 运行 npm run migrate 创建数据库表');
    console.log('6. 运行 npm run dev 启动开发服务器');
    console.log('\\n🌐 API 文档地址: http://localhost:' + serverPort + '/docs');

  } catch (error) {
    console.error('❌ 设置过程中出现错误:', error.message);
  } finally {
    rl.close();
  }
}

setupProject();