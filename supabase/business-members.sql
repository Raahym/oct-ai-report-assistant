alter table profiles add column if not exists business_permissions jsonb default '{}'::jsonb;

update profiles
set business_permissions = '{
  "manage_members": true,
  "add_hospitals": true,
  "edit_hospitals": true,
  "suspend_hospitals": true,
  "manage_modules": true,
  "delete_hospitals": true
}'::jsonb
where role = 'afio_admin'
  and lower(email) = 'raahymm@gmail.com';
