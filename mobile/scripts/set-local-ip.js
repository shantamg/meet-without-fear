const { execSync } = require('child_process');
const fs = require('fs');

try {
  const ip = execSync('ipconfig getifaddr en0').toString().trim();
  const newApiUrl = `EXPO_PUBLIC_API_URL=http://${ip}:3000`;

  // Read existing .env file if it exists
  let envContent = '';
  if (fs.existsSync('.env')) {
    envContent = fs.readFileSync('.env', 'utf8');
  }

  // Parse existing env vars
  const envVars = new Map();
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key) {
        envVars.set(key.trim(), valueParts.join('='));
      }
    }
  });

  // Update or add API URL
  envVars.set('EXPO_PUBLIC_API_URL', `http://${ip}:3000`);

  // Add EXPO_ROUTER_APP_ROOT if not present
  if (!envVars.has('EXPO_ROUTER_APP_ROOT')) {
    envVars.set('EXPO_ROUTER_APP_ROOT', './app');
  }

  // Write back to .env
  const newContent = Array.from(envVars.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n';

  fs.writeFileSync('.env', newContent);
  console.log(`⇢ EXPO_PUBLIC_API_URL=${newApiUrl}`);
  console.log('✅ Local IP address detected and set successfully!');
} catch (error) {
  console.error('❌ Failed to detect local IP address automatically.');
  console.error('Error:', error.message);
  console.log('\n📱 To use Expo Go app, please manually set your local IP address:');
  console.log('1. Find your local IP address:');
  console.log('   - macOS: System Preferences > Network > Advanced > TCP/IP');
  console.log('   - Or run: ifconfig | grep "inet " | grep -v 127.0.0.1');
  console.log('2. Create or edit .env file with:');
  console.log('   EXPO_PUBLIC_API_URL=http://YOUR_IP_ADDRESS:3000');
  console.log('3. Replace YOUR_IP_ADDRESS with your actual local IP (e.g., 192.168.1.100)');
  process.exit(1);
}
