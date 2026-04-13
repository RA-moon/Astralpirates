import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE public.logs
    SET path = regexp_replace(path, '^logbook/logs/', 'logbook/')
    WHERE path LIKE 'logbook/logs/%';
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    UPDATE public.logs
    SET path = regexp_replace(path, '^logbook/', 'logbook/logs/')
    WHERE path LIKE 'logbook/%' AND path NOT LIKE 'logbook/logs/%';
  `);
}
