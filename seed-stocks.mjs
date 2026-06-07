import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const stocks = [
  { stockName: 'Apple', symbol: 'AAPL' },
  { stockName: 'Microsoft', symbol: 'MSFT' },
  { stockName: 'Google', symbol: 'GOOGL' },
  { stockName: 'Amazon', symbol: 'AMZN' },
  { stockName: 'Nvidia', symbol: 'NVDA' },
  { stockName: 'Tesla', symbol: 'TSLA' },
];

async function seedStocks() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    for (const stock of stocks) {
      await connection.execute(
        `INSERT INTO trackedStocks (stockName, symbol, status) VALUES (?, ?, ?)`,
        [stock.stockName, stock.symbol, 'WAIT']
      );
      console.log(`✓ Inserted ${stock.stockName} (${stock.symbol})`);
    }
    console.log('\n✓ All stocks seeded successfully!');
  } catch (error) {
    console.error('Error seeding stocks:', error);
  } finally {
    await connection.end();
  }
}

seedStocks();
