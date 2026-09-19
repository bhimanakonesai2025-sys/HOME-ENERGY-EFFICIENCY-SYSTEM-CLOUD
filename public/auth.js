const form =
    document.getElementById(
        "loginForm"
    );


/* If already logged in,
   go directly to dashboard. */

if (
    localStorage.getItem(
        "energyflow_token"
    )
) {
    window.location.href =
        "/index.html";
}


form.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        const message =
            document.getElementById(
                "message"
            );


        message.textContent =
            "Signing in...";


        try {

            const response =
                await fetch(
                    "/api/auth/login",
                    {
                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({

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
                    "Login failed."
                );
            }


            /*
             * Store the JWT token
             * in the browser.
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