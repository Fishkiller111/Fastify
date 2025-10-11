import { FastifyInstance, FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { JwtUser } from './jwt.js';
import UserService from '../modules/user/service.js';

// 为了避免与@fastify/jwt的类型声明冲突，我们通过类型断言来处理

/**
 * 用户认证中间件
 * @param requiredPermissions 可选的权限要求
 */
function userAuth(requiredPermissions?: string[]): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      console.log('=== 用户 JWT Authentication Started ===');
      console.log('Authorization header:', request.headers.authorization);

      // 检查Authorization头是否存在
      if (!request.headers.authorization) {
        console.error('No Authorization header found');
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Missing authorization header'
        });
      }

      // 检查Bearer格式
      if (!request.headers.authorization.startsWith('Bearer ')) {
        console.error('Invalid authorization header format');
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid authorization header format'
        });
      }

      // 提取token
      const token = request.headers.authorization.substring(7);
      console.log('Extracted token:', token);

      // 手动验证JWT token
      const decoded = jwt.verify(token, config.jwt.secret) as JwtUser;
      console.log('JWT token verified successfully. Payload:', decoded);

      // 确保token包含必要字段
      if (!('userId' in decoded)) {
        console.error('Invalid token payload');
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid token payload'
        });
      }

      // 从数据库获取用户完整信息（包括角色和权限）
      const user = await UserService.getSafeUserById(decoded.userId);
      if (!user || user.status !== 'active') {
        console.error('User not found or inactive');
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'User not found or inactive'
        });
      }

      // 检查权限（如果指定）
      if (requiredPermissions && requiredPermissions.length > 0) {
        const hasPermission = requiredPermissions.some(permission =>
          user.permissions.includes(permission)
        );

        if (!hasPermission) {
          console.error('Insufficient permissions. Required:', requiredPermissions, 'Has:', user.permissions);
          return reply.code(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Insufficient permissions'
          });
        }
      }

      // 将用户信息附加到请求对象
      (request as any).user = {
        ...decoded,
        role: user.role,
        permissions: user.permissions,
        status: user.status
      };

      console.log('=== 用户 JWT Authentication Successful ===');
    } catch (err: any) {
      console.error('JWT verification failed:', err);
      console.error('Error details:', {
        name: err?.name,
        message: err?.message
      });
      return reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid or missing token'
      });
    }
  };
}

/**
 * 管理员认证中间件
 * @param requiredPermissions 必需的权限列表
 */
function adminAuth(requiredPermissions: string[] = []): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      console.log('=== 管理员 JWT Authentication Started ===');
      console.log('Authorization header:', request.headers.authorization);

      // 检查Authorization头是否存在
      if (!request.headers.authorization) {
        console.error('No Authorization header found');
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Missing authorization header'
        });
      }

      // 检查Bearer格式
      if (!request.headers.authorization.startsWith('Bearer ')) {
        console.error('Invalid authorization header format');
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid authorization header format'
        });
      }

      // 提取token
      const token = request.headers.authorization.substring(7);
      console.log('Extracted token:', token);

      // 手动验证JWT token
      const decoded = jwt.verify(token, config.jwt.secret) as JwtUser;
      console.log('JWT token verified successfully. Payload:', decoded);

      // 确保token包含必要字段
      if (!('userId' in decoded) || !('role' in decoded)) {
        console.error('Invalid token payload');
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid token payload'
        });
      }

      // 从数据库获取用户完整信息（检查管理员权限）
      const user = await UserService.getSafeUserById(decoded.userId);
      if (!user || user.status !== 'active') {
        console.error('User not found or inactive');
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'User not found or inactive'
        });
      }

      // 检查是否为管理员或超级管理员
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        console.error('User is not an admin or super_admin');
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Admin access required'
        });
      }

      // super_admin 拥有最高权限，跳过权限检查
      if (user.role === 'super_admin') {
        console.log('Super admin detected, bypassing permission checks');
      } else {
        // 普通 admin 需要检查具体权限
        if (requiredPermissions.length > 0) {
          const hasPermission = requiredPermissions.some(permission =>
            user.permissions.includes(permission)
          );

          if (!hasPermission) {
            console.error('Insufficient permissions. Required:', requiredPermissions, 'Has:', user.permissions);
            return reply.code(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Insufficient permissions'
            });
          }
        }
      }

      // 将管理员信息附加到请求对象
      (request as any).admin = {
        ...decoded,
        role: user.role,
        permissions: user.permissions,
        status: user.status
      };

      console.log('=== 管理员 JWT Authentication Successful ===');
    } catch (err: any) {
      console.error('Admin JWT verification failed:', err);
      console.error('Error details:', {
        name: err?.name,
        message: err?.message
      });
      return reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid or missing admin token'
      });
    }
  };
}

/**
 * 认证插件
 * @param fastify Fastify实例
 */
async function authPlugin(fastify: FastifyInstance) {
  // 注册用户认证中间件
  fastify.decorate('userAuth', userAuth);

  // 注册管理员认证中间件
  fastify.decorate('adminAuth', adminAuth);
}

// 类型声明
declare module 'fastify' {
  interface FastifyInstance {
    userAuth(requiredPermissions?: string[]): preHandlerHookHandler;
    adminAuth(requiredPermissions?: string[]): preHandlerHookHandler;
  }
}

export default fp(authPlugin);