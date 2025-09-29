import http from 'http';

const baseURL = 'http://127.0.0.1:3001';

// 通用请求函数
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 3001,
      path: path,
      method: method,
      headers: {}
    };

    // 只有在有数据时才设置Content-Type
    if (data) {
      options.headers['Content-Type'] = 'application/json';
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`\n--- ${method} ${path} ---`);
        console.log('Status:', res.statusCode);
        console.log('Response:', data);
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, data: jsonData });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (err) => {
      console.error('Error:', err);
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function testUserAdmin() {
  console.log('=== 测试管理端用户管理接口 ===');

  let createdUserId = null;

  try {
    // 1. 获取用户列表（空）
    console.log('\n1. 获取用户列表（初始状态）');
    await makeRequest('GET', '/api/admin/users');

    // 2. 创建第一个用户
    console.log('\n2. 创建第一个用户');
    const createResult1 = await makeRequest('POST', '/api/admin/users', {
      username: 'admin_user1',
      email: 'admin1@example.com',
      password: '123456',
      phone_number: '13800138001'
    });

    if (createResult1.status === 201) {
      createdUserId = createResult1.data.id;
    }

    // 3. 创建第二个用户（只有基本信息）
    console.log('\n3. 创建第二个用户（无手机号）');
    await makeRequest('POST', '/api/admin/users', {
      username: 'admin_user2',
      email: 'admin2@example.com',
      password: 'password123'
    });

    // 4. 尝试创建重复用户名的用户（应该失败）
    console.log('\n4. 尝试创建重复用户名的用户');
    await makeRequest('POST', '/api/admin/users', {
      username: 'admin_user1',
      email: 'different@example.com',
      password: '123456'
    });

    // 5. 尝试创建重复邮箱的用户（应该失败）
    console.log('\n5. 尝试创建重复邮箱的用户');
    await makeRequest('POST', '/api/admin/users', {
      username: 'different_user',
      email: 'admin1@example.com',
      password: '123456'
    });

    // 6. 获取用户列表（有数据）
    console.log('\n6. 获取用户列表（有数据）');
    await makeRequest('GET', '/api/admin/users?page=1&limit=5');

    // 7. 搜索用户
    console.log('\n7. 搜索用户（关键词: admin）');
    await makeRequest('GET', '/api/admin/users?search=admin&page=1&limit=10');

    // 8. 按用户名排序
    console.log('\n8. 按用户名升序排序');
    await makeRequest('GET', '/api/admin/users?sortBy=username&sortOrder=asc');

    // 9. 获取用户详情
    if (createdUserId) {
      console.log('\n9. 获取用户详情');
      await makeRequest('GET', `/api/admin/users/${createdUserId}`);
    }

    // 10. 获取不存在的用户详情
    console.log('\n10. 获取不存在的用户详情');
    await makeRequest('GET', '/api/admin/users/99999');

    // 11. 更新用户信息
    if (createdUserId) {
      console.log('\n11. 更新用户信息');
      await makeRequest('PUT', `/api/admin/users/${createdUserId}`, {
        username: 'updated_admin_user1',
        email: 'updated_admin1@example.com'
      });
    }

    // 12. 更新用户密码
    if (createdUserId) {
      console.log('\n12. 更新用户密码');
      await makeRequest('PUT', `/api/admin/users/${createdUserId}`, {
        password: 'new_password_123'
      });
    }

    // 13. 尝试更新为已存在的用户名（应该失败）
    if (createdUserId) {
      console.log('\n13. 尝试更新为已存在的用户名');
      await makeRequest('PUT', `/api/admin/users/${createdUserId}`, {
        username: 'admin_user2'
      });
    }

    // 14. 检查用户名是否存在
    console.log('\n14. 检查用户名是否存在');
    await makeRequest('GET', '/api/admin/users/check/username?username=admin_user2');

    // 15. 检查邮箱是否存在
    console.log('\n15. 检查邮箱是否存在');
    await makeRequest('GET', '/api/admin/users/check/email?email=admin2@example.com');

    // 16. 检查手机号是否存在
    console.log('\n16. 检查手机号是否存在');
    await makeRequest('GET', '/api/admin/users/check/phone?phone_number=13800138001');

    // 17. 检查不存在的用户名
    console.log('\n17. 检查不存在的用户名');
    await makeRequest('GET', '/api/admin/users/check/username?username=nonexistent_user');

    // 18. 删除用户
    if (createdUserId) {
      console.log('\n18. 删除用户');
      await makeRequest('DELETE', `/api/admin/users/${createdUserId}`);
    }

    // 19. 尝试删除不存在的用户
    console.log('\n19. 尝试删除不存在的用户');
    await makeRequest('DELETE', '/api/admin/users/99999');

    // 20. 验证删除后的用户列表
    console.log('\n20. 验证删除后的用户列表');
    await makeRequest('GET', '/api/admin/users');

    // 21. 测试分页功能
    console.log('\n21. 测试分页功能（limit=1）');
    await makeRequest('GET', '/api/admin/users?page=1&limit=1');

    // 22. 测试无效的分页参数
    console.log('\n22. 测试无效的分页参数');
    await makeRequest('GET', '/api/admin/users?page=0&limit=200');

    // 23. 测试搜索手机号
    console.log('\n23. 测试搜索手机号');
    await makeRequest('GET', '/api/admin/users?search=13800138001');

    // 24. 测试空搜索
    console.log('\n24. 测试空搜索');
    await makeRequest('GET', '/api/admin/users?search=');

    // 25. 清理：删除剩余的测试用户
    console.log('\n25. 清理测试数据');
    const userListResult = await makeRequest('GET', '/api/admin/users');
    if (userListResult.status === 200 && userListResult.data.data) {
      for (const user of userListResult.data.data) {
        if (user.username.startsWith('admin_user')) {
          console.log(`删除测试用户: ${user.username}`);
          await makeRequest('DELETE', `/api/admin/users/${user.id}`);
        }
      }
    }

  } catch (error) {
    console.error('测试过程中出错:', error);
  }
}

testUserAdmin();