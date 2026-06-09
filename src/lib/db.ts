import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

let pool: any = null;

export function getPool() {
  if (!pool) {
    // Default to the locally created surveillance_db if DATABASE_URL is not set
    const connectionString = process.env.DATABASE_URL || 'postgresql://gowthamganesh@localhost:5432/surveillance_db';
    
    const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    
    const pgPool = new Pool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 5,                        // limit connection usage
      idleTimeoutMillis: 30000,      // close idle connections after 30 seconds
      connectionTimeoutMillis: 15000 // wait 15 seconds max to connect
    });

    pgPool.on('error', (err) => {
      console.error('Unexpected error on idle database client', err);
    });

    // Wrap the pool with retry logic for network and cold start resiliency
    pool = {
      query: async (text: string, params?: any[]) => {
        let attempts = 3;
        while (attempts > 0) {
          try {
            return await pgPool.query(text, params);
          } catch (err: any) {
            attempts--;
            const isNetworkOrTimeout = 
              err.message.includes('timeout') || 
              err.message.includes('connect') || 
              err.code === 'ETIMEDOUT' || 
              err.code === 'ECONNREFUSED' ||
              err.message.includes('connection') ||
              err.message.includes('ssl');
            
            if (isNetworkOrTimeout && attempts > 0) {
              console.warn(`Database query failed, retrying in 2s... (${attempts} attempts left). Error: ${err.message}`);
              await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
              throw err;
            }
          }
        }
        throw new Error("Database query failed after all retry attempts.");
      },
      on: (event: string, callback: (...args: any[]) => void) => {
        pgPool.on(event as any, callback);
      },
      end: () => pgPool.end()
    };
  }
  return pool;
}

export async function initDb() {
  const p = getPool();
  try {
    const schemaPath = path.join(process.cwd(), 'src', 'lib', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await p.query(schema);
    console.log("PostgreSQL database tables initialized successfully.");
  } catch (error) {
    console.error("Failed to initialize database tables:", error);
  }
}
