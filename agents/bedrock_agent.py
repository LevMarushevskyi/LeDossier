import boto3

client = boto3.client('bedrock-runtime', region_name='us-east-1')

def get_reply(prompt):
    response = client.converse(
        modelId='nvidia.nemotron-nano-12b-v2',
        messages=[
            {
                'role': 'user',
                'content': [{'text': prompt}]
            }
        ]
    )
    reply = response["output"]["message"]["content"][0]["text"]
    return reply