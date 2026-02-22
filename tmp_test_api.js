// Test the admin API directly to see the actual error
async function testApi() {
  const baseUrl = 'http://localhost:3001';

  // First, login to get a session cookie
  console.log('1. Logging in...');
  try {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@oppsera.com', password: 'admin123' }),
    });
    console.log('Login status:', loginRes.status);
    const loginBody = await loginRes.text();
    console.log('Login body:', loginBody);

    // Get the set-cookie header
    const cookies = loginRes.headers.getSetCookie?.() || loginRes.headers.get('set-cookie');
    console.log('Cookies:', cookies);

    if (loginRes.ok) {
      // Now hit the tenants API with the cookie
      console.log('\n2. Fetching tenants...');
      const cookieStr = typeof cookies === 'string' ? cookies : (cookies ? cookies.join('; ') : '');
      const tenantsRes = await fetch(`${baseUrl}/api/v1/tenants`, {
        headers: { 'Cookie': cookieStr },
      });
      console.log('Tenants status:', tenantsRes.status);
      const tenantsBody = await tenantsRes.text();
      console.log('Tenants body:', tenantsBody);
    }
  } catch (e) {
    console.error('Error:', e.message);
  }

  // Also try without auth to see what error we get
  console.log('\n3. Fetching tenants without auth...');
  try {
    const noAuthRes = await fetch(`${baseUrl}/api/v1/tenants`);
    console.log('No-auth status:', noAuthRes.status);
    const noAuthBody = await noAuthRes.text();
    console.log('No-auth body:', noAuthBody);
  } catch (e) {
    console.error('No-auth error:', e.message);
  }
}

testApi();
