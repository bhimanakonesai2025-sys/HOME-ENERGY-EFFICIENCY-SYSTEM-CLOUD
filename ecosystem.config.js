module.exports = {

    apps: [

        {
            name:
                "energyflow",

            script:
                "server.js",

            /*
             * Run one worker per
             * available CPU core.
             *
             * This is used when the
             * application is deployed
             * on the cloud VM.
             */

            instances:
                "max",

            exec_mode:
                "cluster",

            autorestart:
                true,

            watch:
                false,

            max_memory_restart:
                "300M",

            env: {
                NODE_ENV:
                    "production"
            }
        }

    ]

};