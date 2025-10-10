import pool from '../src/config/database.js';
async function queryUsers() {
    const client = await pool.connect();
    try {
        console.log('Connected to database');
        const result = await client.query('SELECT * FROM users;');
        console.log('Users:', result.rows);
    }
    catch (err) {
        console.error('Error querying users:', err);
    }
    finally {
        client.release();
    }
}
queryUsers();
//# sourceMappingURL=query-users.js.map