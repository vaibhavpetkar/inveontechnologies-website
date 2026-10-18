-- Custom SQL migration file, put you code below! ---- Every existing environment runs on exactly one server: its own. It keeps
-- its ports, live colour and release there, and nothing about how it is
-- deployed or served changes.
INSERT INTO "environment_replicas" ("environment_id", "server_id", "blue_port", "green_port", "status", "active_slot", "current_release_id")
SELECT "id", "server_id", "blue_port", "green_port", 'active', "active_slot", "current_release_id" FROM "environments"
ON CONFLICT DO NOTHING;
