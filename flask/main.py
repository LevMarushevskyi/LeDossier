from flask import Flask, redirect, url_for, session
from flask_cors import CORS
from authlib.integrations.flask_client import OAuth
import os

app = Flask(__name__)
# Use a fixed secret key for development (OAuth state needs consistent session)
# In production, use a secure random key from environment variable
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'dev-secret-key-change-in-production-abc123')

# Configure session cookies for localhost development
# SameSite='Lax' works with HTTP (localhost), 'None' requires HTTPS
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = False  # Set to True in production with HTTPS
app.config['SESSION_COOKIE_HTTPONLY'] = True

# Enable CORS with credentials support
# This allows the React Native app to send cookies with requests
CORS(app, supports_credentials=True, origins=['http://localhost:8081', 'http://localhost:19006'])

oauth = OAuth(app)

oauth.register(
  name='oidc',
  authority='https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XSZEJwbSO',
  client_id='54lian7roa16c4rc4uou9mvu2v',
  client_secret='oiktgi9sb0514gj0o324shmitmt7g3d1ca2bkn5sf4vh93n99jr',
  server_metadata_url='https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XSZEJwbSO/.well-known/openid-configuration',
  client_kwargs={'scope': 'email openid phone'}
)

@app.route('/')
def index():
    user = session.get('user')
    if user:
        return  f'Hello, {user["email"]}. <a href="/logout">Logout</a>'
    else:
        return f'Welcome! Please <a href="/login">Login</a>.'
    
@app.route('/login')
def login():
    # Use the authorize endpoint as the OAuth callback
    redirect_uri = url_for('authorize', _external=True)
    return oauth.oidc.authorize_redirect(redirect_uri)

@app.route('/authorize')
def authorize():
    # Exchange authorization code for tokens
    oauth.oidc.authorize_access_token()

    # Fetch userinfo from Cognito
    userinfo = oauth.oidc.userinfo()
    session['user'] = userinfo

    # Get user email
    email = userinfo.get('email', 'user')
    deep_link = f'ledossier://auth?email={email}&success=true'

    # Return HTML page that works for both mobile and web
    # Mobile: JavaScript triggers deep link (ledossier://)
    # Web: JavaScript uses postMessage and localStorage to communicate with parent window
    return f'''
    <!DOCTYPE html>
    <html>
    <head>
        <title>Authentication Successful</title>
        <meta charset="utf-8">
        <style>
            body {{
                font-family: Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background-color: #0C001A;
                color: #FFFDEE;
                text-align: center;
            }}
            .container {{
                padding: 40px;
                max-width: 500px;
            }}
            h1 {{
                margin-bottom: 20px;
                font-size: 28px;
            }}
            p {{
                margin: 15px 0;
                line-height: 1.6;
            }}
            a {{
                color: #FFFDEE;
                text-decoration: underline;
            }}
            .email {{
                font-weight: bold;
                color: #FFFDEE;
                background-color: rgba(255, 253, 238, 0.1);
                padding: 5px 10px;
                border-radius: 5px;
                display: inline-block;
                margin: 10px 0;
            }}
            .button {{
                display: inline-block;
                margin-top: 20px;
                padding: 12px 24px;
                background-color: #FFFDEE;
                color: #0C001A;
                text-decoration: none;
                border-radius: 5px;
                font-weight: bold;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>✓ Authentication Successful!</h1>
            <p>Welcome, <span class="email">{email}</span></p>
            <p id="status">Redirecting back to Le Dossier...</p>
            <p style="font-size: 14px; margin-top: 30px; opacity: 0.8;">
                If you're not redirected automatically, you can close this window and return to the app.
            </p>
        </div>
        <script>
            const authData = {{
                email: "{email}",
                success: true,
                timestamp: new Date().toISOString()
            }};

            // For MOBILE: Try to trigger deep link
            function tryDeepLink() {{
                try {{
                    window.location.href = "{deep_link}";

                    // Also try opening in a new context
                    setTimeout(function() {{
                        window.open("{deep_link}", "_self");
                    }}, 500);
                }} catch (e) {{
                    console.log("Deep link not supported on this platform");
                }}
            }}

            // For WEB: Use postMessage and localStorage to communicate
            function notifyWebApp() {{
                try {{
                    // Store auth data in localStorage for web platform
                    localStorage.setItem('ledossier_auth', JSON.stringify(authData));

                    // If opened in a popup, notify the parent window
                    if (window.opener) {{
                        window.opener.postMessage({{
                            type: 'LEDOSSIER_AUTH_SUCCESS',
                            data: authData
                        }}, '*');

                        // Update status and close window after delay
                        document.getElementById('status').textContent =
                            'Authentication complete! This window will close shortly...';

                        setTimeout(function() {{
                            window.close();
                        }}, 2000);
                    }} else {{
                        // Not a popup, user needs to close manually
                        document.getElementById('status').textContent =
                            'You can now close this tab and return to Le Dossier.';
                    }}
                }} catch (e) {{
                    console.log("Web communication methods not available");
                }}
            }}

            // Try both methods
            tryDeepLink();  // For mobile
            notifyWebApp(); // For web
        </script>
    </body>
    </html>
    '''

@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('index'))

if __name__ == '__main__':
    app.run(debug=True)