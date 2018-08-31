export class MysqlMetaQuery {
  constructor(private target, private queryModel) {}

  getOperators(datatype: string) {
    switch (datatype) {
      case 'float4':
      case 'float8': {
        return ['=', '!=', '<', '<=', '>', '>='];
      }
      case 'text':
      case 'varchar':
      case 'char': {
        return ['=', '!=', '<', '<=', '>', '>=', 'IN', 'NOT IN', 'LIKE', 'NOT LIKE', '~', '~*', '!~', '!~*'];
      }
      default: {
        return ['=', '!=', '<', '<=', '>', '>=', 'IN', 'NOT IN'];
      }
    }
  }

  // quote identifier as literal to use in metadata queries
  quoteIdentAsLiteral(value) {
    return this.queryModel.quoteLiteral(this.queryModel.unquoteIdentifier(value));
  }

  findMetricTable() {
    // query that returns first table found that has a timestamp(tz) column and a float column
    let query = `
  SELECT
    table_name as table_name,
    ( SELECT
        column_name as column_name
      FROM information_schema.columns c
      WHERE
        c.table_schema = t.table_schema AND
        c.table_name = t.table_name AND
        c.data_type IN ('timestamp', 'datetime')
      ORDER BY ordinal_position LIMIT 1
    ) AS time_column,
    ( SELECT
        column_name AS column_name
      FROM information_schema.columns c
      WHERE
        c.table_schema = t.table_schema AND
        c.table_name = t.table_name AND
        c.data_type IN('float', 'int', 'bigint')
      ORDER BY ordinal_position LIMIT 1
    ) AS value_column
  FROM information_schema.tables t
  WHERE
    EXISTS
    ( SELECT 1
      FROM information_schema.columns c
      WHERE
        c.table_schema = t.table_schema AND
        c.table_name = t.table_name AND
        c.data_type IN ('timestamp', 'datetime')
    ) AND
    EXISTS
    ( SELECT 1
      FROM information_schema.columns c
      WHERE
        c.table_schema = t.table_schema AND
        c.table_name = t.table_name AND
        c.data_type IN('float', 'int', 'bigint')
    )
  LIMIT 1
;`;
    return query;
  }

  buildTableConstraint(table: string) {
    let query = '';

    // check for schema qualified table
    if (table.includes('.')) {
      let parts = table.split('.');
      query = 'table_schema = ' + this.quoteIdentAsLiteral(parts[0]);
      query += ' AND table_name = ' + this.quoteIdentAsLiteral(parts[1]);
      return query;
    } else {
      query = ' table_name = ' + this.quoteIdentAsLiteral(table);

      return query;
    }
  }

  buildTableQuery() {
    return "SELECT table_name FROM information_schema.tables WHERE table_schema <> 'information_schema' ORDER BY table_name";
  }

  buildColumnQuery(type?: string) {
    let query = 'SELECT column_name FROM information_schema.columns WHERE ';
    query += this.buildTableConstraint(this.target.table);

    switch (type) {
      case 'time': {
        query += " AND data_type IN ('timestamp','datetime','bigint','int','float')";
        break;
      }
      case 'metric': {
        query += " AND data_type IN ('text' 'tinytext','mediumtext', 'longtext', 'varchar')";
        break;
      }
      case 'value': {
        query +=
          " AND data_type IN ('bigint','int','float','smallint', 'mediumint', 'tinyint', 'double', 'decimal', 'float')";
        query += ' AND column_name <> ' + this.quoteIdentAsLiteral(this.target.timeColumn);
        break;
      }
      case 'group': {
        query += " AND data_type IN ('text' 'tinytext','mediumtext', 'longtext', 'varchar')";
        break;
      }
    }

    query += ' ORDER BY column_name';

    return query;
  }

  buildValueQuery(column: string) {
    let query = 'SELECT DISTINCT QUOTE(' + column + ')';
    query += ' FROM ' + this.target.table;
    query += ' WHERE $__timeFilter(' + this.target.timeColumn + ')';
    query += ' ORDER BY 1 LIMIT 100';
    return query;
  }

  buildDatatypeQuery(column: string) {
    let query = `
SELECT data_type
FROM information_schema.columns
WHERE `;
    query += ' table_name = ' + this.quoteIdentAsLiteral(this.target.table);
    query += ' AND column_name = ' + this.quoteIdentAsLiteral(column);
    return query;
  }
}