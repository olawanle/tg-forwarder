#!/usr/bin/env bash
set -euo pipefail

sed -i "s/^#listen_addresses = .*/listen_addresses = '*'/; s/^listen_addresses = .*/listen_addresses = '*'/" /etc/postgresql/18/main/postgresql.conf
if ! grep -q "0.0.0.0/0" /etc/postgresql/18/main/pg_hba.conf; then
  echo "host all all 0.0.0.0/0 scram-sha-256" >> /etc/postgresql/18/main/pg_hba.conf
fi

sed -i "s/^bind .*/bind 0.0.0.0 ::1/" /etc/redis/redis.conf

service postgresql restart || service postgresql start
service redis-server restart || service redis-server start

if ! su - postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='campaign'\"" | grep -q 1; then
  su - postgres -c "createuser campaign"
fi

su - postgres -c "psql -c \"ALTER USER campaign WITH PASSWORD 'campaign';\""

if ! su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='campaign'\"" | grep -q 1; then
  su - postgres -c "createdb campaign -O campaign"
fi

echo "WSL PostgreSQL and Redis are ready."
echo "WSL IP: $(hostname -I | awk '{print $1}')"
