const form =
    document.getElementById(
        "registerForm"
    );


form.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        const message =
            document.getElementById(
                "message"
            );


        message.textContent =
            "Creating account...";


        try {

            const response =
                await fetch(
                    "/api/auth/register",
                    {
                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({

                                name:
                                    document
                                        .getElementById(
                                            "name"
                                        )
                                        .value,

                                email:
                                    document
                                        .getElementById(
                                            "email"
                                        )
                                        .value,

                                password:
                                    document
                                        .getElementById(
                                            "password"
                                        )
                                        .value

                            })
                    }
                );


            const data =
                await response.json();


            if (
                !response.ok
            ) {
                throw new Error(
                    data.message ||
                    "Registration failed."
                );
            }


            /*
             * Registration automatically
             * logs the user in.
             */

            localStorage.setItem(
                "energyflow_token",
                data.token
            );


            localStorage.setItem(
                "energyflow_user",
                JSON.stringify(
                    data.user
                )
            );


            window.location.href =
                "/index.html";


        } catch (error) {

            message.textContent =
                error.message;

        }

    }
);