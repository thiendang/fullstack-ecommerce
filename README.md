## Section 11: Handle Access Token and Refresh Token
In this section, we will have a single parameter. The sole parameter is to check if the token has already been used.

First, we will check if the token has been used in our storage. We will examine all previous records. If the token has already been used, we log it to detect anyone attempting to reuse it. This is the most basic check.

```jsx
static findByRefreshTokenUsed = async (refreshToken) => {
  return await keyTokenModel.findOne({ refreshTokensUsed: refreshToken }).lean();
};

static findByRefreshToken = async (refreshToken) => {
  return await keyTokenModel.findOne({ refreshToken });
};

static deleteKeyById = async (userId) => {
  return await keyTokenModel.findByIdAndDelete({ userId });
};
```

Next, if the token has been used, we need to add this token to a suspect list. Our task when checking the token is to ensure that when the token expires, the user will have to use a new token to regain access. If someone has already used this token, we will add the user to the suspect list.

```jsx
const foundToken = await KeyTokenService.findByRefreshTokenUsed(refreshToken);

if (foundToken) {
  // decode user
  const { userId } = await verifyJWT(refreshToken, foundToken.privateKey);

  // delete token in key store
  await KeyTokenService.deleteKeyById(userId);
  throw new Api403Error("Something went wrong!");
}
```

The system will verify the user when it detects a suspect token. If verification fails, the system will delete all related tokens and require the user to log in again to issue a new token. This is a simple and effective way to ensure system security.

```jsx
// refresh token invalid
const holderToken = await KeyTokenService.findByRefreshToken(refreshToken);
// check token exists
if (!holderToken) throw new Api401Error("Invalid token");
```

If successful, the user will be issued a new token. Here is an example of checking email and verifying the token.

```jsx
// verify token
const { userId, email } = verifyJWT(refreshToken, holderToken.privateKey);
```

We also need to write additional functions to search and verify email, token, and other operations to ensure the system functions effectively.

```jsx
// check user
const foundShop = await findByEmail({ email });
if (!foundShop) throw new Api401Error("Invalid token");

// create accessToken, refreshToken
const tokens = await createTokenPair(
  { userId, email },
  holderToken.publicKey,
  holderToken.privateKey
);

// update token
await holderToken.update({
  $set: {
    refreshToken: tokens.refreshToken,
  },
  $addToSet: {
    refreshTokensUsed: refreshToken,
  },
});

// return new tokens
return {
  user: { userId, email },
  tokens,
};
```

Finally, the system will store the information and send alerts if a suspect token is detected, ensuring that users always log in again to issue a new token, thereby enhancing system security.
