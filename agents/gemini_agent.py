from google import genai
import os

# The client gets the API key from the environment variable `GEMINI_API_KEY`.
client = genai.Client(api_key=os.environ['GEMINI_API_KEY'])

def get_reply(prompt):
    response = client.models.generate_content(
        model="gemini-3-flash-preview", contents=prompt
    )

    reply = response.text
    return reply