from flask import Flask, redirect, url_for, session
from authlib.integrations.flask_client import OAuth
import os

app = Flask(__name__)
app.secret_key = os.urandom(24)  # Use a secure random key in production
oauth = OAuth(app)

oauth.register(
  name='oidc',
  authority='https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XSZEJwbSO',
  client_id='54lian7roa16c4rc4uou9mvu2v',
  client_secret='oiktgi9sb0514gj0o324shmitmt7g3d1ca2bkn5sf4vh93n99jr',
  server_metadata_url='https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XSZEJwbSO/.well-known/openid-configuration',
  client_kwargs={'scope': 'email'}
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
    token = oauth.oidc.authorize_access_token()
    user = token['userinfo']
    session['user'] = user

    # Redirect back to React Native app using deep link
    # Pass user email and success status
    email = user.get('email', 'user')
    return redirect(f'ledossier://auth?email={email}&success=true')

@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('index'))

if __name__ == '__main__':
    app.run(debug=True)