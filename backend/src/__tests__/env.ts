// Set test environment variables
Object.defineProperty(process.env, 'NODE_ENV', { value: 'test', writable: true, configurable: true });
process.env.PORT = '3001';
