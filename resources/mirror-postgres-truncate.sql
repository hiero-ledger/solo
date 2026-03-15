do
'
declare
    t record;
begin
for t in select table_name
from information_schema.tables
where table_schema = ''public'' and table_name !~ ''.*(flyway|transaction_type|citus_).*'' and table_type <> ''VIEW''
    loop
    execute format(''lock table %s in access exclusive mode'', t.table_name);
    execute format(''truncate %s restart identity cascade'', t.table_name);
    commit;
    end loop;
end;
';
