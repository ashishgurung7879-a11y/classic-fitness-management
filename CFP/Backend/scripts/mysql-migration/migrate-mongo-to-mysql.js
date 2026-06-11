console.error('MongoDB import has been retired after the MySQL persistence migration.');
console.error('Run the MySQL-backed application against the schema in scripts/mysql-migration/schema.sql.');
process.exitCode = 1;
