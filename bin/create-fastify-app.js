#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 获取命令行参数
const args = process.argv.slice(2);
const projectName = args[0] || '';

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

function copyTemplateFiles(templateDir, targetDir, replacements) {
  // 确保目标目录存在
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const items = fs.readdirSync(templateDir);

  for (const item of items) {
    const templatePath = path.join(templateDir, item);
    const targetPath = path.join(targetDir, item);

    // 跳过不需要复制的文件
    if (item === 'node_modules' || item === 'dist' || item === '.git' ||
        item === 'bin' || item === 'setup.js' || item === 'template.json') {
      continue;
    }

    const stat = fs.statSync(templatePath);

    if (stat.isDirectory()) {
      copyTemplateFiles(templatePath, targetPath, replacements);
    } else {
      let content = fs.readFileSync(templatePath, 'utf8');

      // 对特定文件进行变量替换
      if (item === 'package.json' || item === '.env.template' || item.endsWith('.md')) {
        for (const [key, value] of Object.entries(replacements)) {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
          content = content.replace(regex, value);
        }
      }

      // 重命名 .env.template 为 .env
      const finalTargetPath = item === '.env.template' ?
        path.join(path.dirname(targetPath), '.env') : targetPath;

      fs.writeFileSync(finalTargetPath, content);
    }
  }
}

async function createProject() {
  console.log('🚀 Fastify TypeScript API 项目生成器');
  console.log('='.repeat(50));

  try {
    // 获取项目名称
    const finalProjectName = projectName || await prompt('项目名称', 'my-fastify-api');
    const projectDir = path.resolve(process.cwd(), finalProjectName);

    // 检查目录是否已存在
    if (fs.existsSync(projectDir)) {
      console.log(`❌ 目录 ${finalProjectName} 已存在！`);
      process.exit(1);
    }

    // 收集项目信息
    const projectDescription = await prompt('项目描述', 'Fastify TypeScript API项目');
    const authorName = await prompt('作者姓名', 'Your Name');
    const authorEmail = await prompt('作者邮箱', 'your.email@example.com');
    const databaseName = await prompt('数据库名称', `${finalProjectName.replace(/[^a-zA-Z0-9]/g, '_')}_db`);
    const serverPort = await prompt('服务器端口', '3000');

    const replacements = {
      projectName: finalProjectName,
      projectDescription,
      authorName,
      authorEmail,
      databaseName,
      serverPort
    };

    console.log(`\n📁 正在创建项目目录: ${finalProjectName}`);

    // 获取模板目录（当前包的根目录）
    const templateDir = path.resolve(__dirname, '..');

    // 复制模板文件
    console.log('📝 正在复制模板文件...');
    copyTemplateFiles(templateDir, projectDir, replacements);

    // 更新生成的 package.json
    const packageJsonPath = path.join(projectDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      // 移除模板相关的配置
      delete packageJson.bin;
      delete packageJson.files;
      packageJson.name = finalProjectName;
      packageJson.version = '0.1.0';
      packageJson.description = projectDescription;
      packageJson.author = {
        name: authorName,
        email: authorEmail
      };

      // 移除模板创建相关的scripts
      delete packageJson.scripts.setup;
      delete packageJson.scripts.prepublishOnly;

      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    }

    console.log('\n🎉 项目创建完成！');
    console.log('\n📋 下一步操作：');
    console.log(`1. cd ${finalProjectName}`);
    console.log('2. 配置 .env 文件中的数据库连接信息');
    console.log('3. 确保 PostgreSQL 数据库正在运行');
    console.log('4. npm install  # 安装依赖');
    console.log('5. npm run build  # 编译项目');
    console.log('6. npm run migrate  # 创建数据库表');
    console.log('7. npm run dev  # 启动开发服务器');
    console.log(`\n🌐 API 文档地址: http://localhost:${serverPort}/docs`);

  } catch (error) {
    console.error('❌ 创建项目时出现错误:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

createProject();