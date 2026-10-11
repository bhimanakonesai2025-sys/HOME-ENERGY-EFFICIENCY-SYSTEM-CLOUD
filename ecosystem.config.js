module.exports = {
    apps: [
        {
            name: "energyflow-web",
            script: "./server.js",
            instances: 1,
            exec_mode: "fork",
            autorestart: true,
            watch: false,
            max_memory_restart: "500M",
            env: {
                NODE_ENV: "production"
            }
        },
        {
            name: "energyflow-worker",
            script: "./services/worker.js",
            instances: 1,
            exec_mode: "fork",
            autorestart: true,
            watch: false,
            max_memory_restart: "500M",
            env: {
                NODE_ENV: "production"
            }
        }
    ]
};