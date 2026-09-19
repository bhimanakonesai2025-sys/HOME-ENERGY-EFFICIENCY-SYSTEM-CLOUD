const {
    DynamoDBClient
} = require("@aws-sdk/client-dynamodb");

const {
    DynamoDBDocumentClient
} = require("@aws-sdk/lib-dynamodb");

const region =
    process.env.AWS_REGION || "ap-south-1";

const client =
    new DynamoDBClient({
        region
    });

const docClient =
    DynamoDBDocumentClient.from(
        client,
        {
            marshallOptions: {
                removeUndefinedValues: true
            }
        }
    );

module.exports = {
    client,
    docClient,
    region
};