import bcrypt from 'bcrypt';
import pool from '../src/config/database.js';
async function checkPassword() {
    const client = await pool.connect();
    try {
        console.log('Connected to database');
        const result = await client.query('SELECT * FROM users WHERE email = $1;', ['test@example.com']);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            console.log('User found:', user);
            const passwordsToTest = ['123456', 'password', 'test123'];
            for (const password of passwordsToTest) {
                const isMatch = await bcrypt.compare(password, user.password);
                console.log(`Password '${password}' matches: ${isMatch}`);
            }
        }
        else {
            console.log('User not found');
        }
    }
    catch (err) {
        console.error('Error querying users:', err);
    }
    finally {
        client.release();
    }
}
checkPassword();
//# sourceMappingURL=check-password.js.map