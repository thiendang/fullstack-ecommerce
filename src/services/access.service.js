const shopModel = require('../models/shop.model');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const KeyTokenService = require('../services/keyToken.service');
const { createTokenPair, verifyJWT } = require('../auth/authUtils');
const { getInfoData } = require('../utils');
const {
  Api403Error,
  BusinessLogicError,
  Api404Error,
  Api401Error,
} = require('../core/error.response');
const { findByEmail } = require('./shop.service');
const apiKeyModel = require('../models/apikey.model');

const RoleShop = {
  SHOP: 'SHOP',
  WRITER: '001',
  READ: '002',
  DELETE: '003',
  ADMIN: '000',
};

class AccessService {
  /**
   * check token is used?
   * when accessToken is expired using refreshToken to get new one
   */
  refreshToken = async (refreshToken) => {
    const foundToken = await KeyTokenService.findByRefreshTokenUsed(refreshToken);

    if (foundToken) {
      // decode user
      const { userId } = await verifyJWT(refreshToken, foundToken.privateKey);

      // delete token in key store
      await KeyTokenService.deleteKeyById(userId);
      throw new Api403Error('Something when wrong!');
    }

    // refresh token invalid
    const holderToken = await KeyTokenService.findByRefreshToken(refreshToken);
    // check token exists
    if (!holderToken) throw new Api401Error('Token valid');

    // verify token
    const { userId, email } = verifyJWT(refreshToken, holderToken.privateKey);
    // check user
    const foundShop = await findByEmail({ email });
    if (!foundShop) throw new Api401Error('Token valid');

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
  };

  /**
   * Action logout
   *
   * @param keyStore
   * @returns {Promise<*>}
   */
  logout = async (keyStore) => {
    const delKey = await KeyTokenService.removeKeyById(keyStore._id);
    console.debug(delKey);
    return delKey;
  };

  /**
   * 1 - Check email in dbs
   * 2 - Match password
   * 3 - Create AT vs RT and save
   * 4 - Generate tokens
   * 5 - Get data return login
   *
   * @param email
   * @param password
   * @param refreshToken
   * @returns {Promise<void>}
   */
  singIn = async ({ email, password, refreshToken = null }) => {
    // 1.
    const foundShop = await findByEmail({ email });
    if (!foundShop) throw new Api403Error('Shop is not registered');

    // 2.
    const match = bcrypt.compare(password, foundShop.password);
    if (!match) throw new BusinessLogicError('Login error');

    // 3. create private key, public key
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'pkcs1',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs1',
        format: 'pem',
      },
    });

    // 4. generate tokens
    const { _id: userId } = foundShop;
    const tokens = await createTokenPair(
      {
        userId: userId.toString(),
        email,
      },
      publicKey,
      privateKey
    );

    await KeyTokenService.createKeyToken({
      userId: userId.toString(),
      privateKey,
      publicKey,
      refreshToken: tokens.refreshToken,
    });

    //
    return {
      shop: getInfoData({
        fields: ['_id', 'name', 'email'],
        object: foundShop,
      }),
      tokens,
    };
  };

  signUp = async ({ name, email, password }) => {
    // step1: check email exists?
    const holderShop = await shopModel.findOne({ email }).lean();
    if (holderShop) {
      throw new Api403Error('Error: Shop already registered');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newShop = await shopModel.create({
      name,
      email,
      password: passwordHash,
      roles: [RoleShop.SHOP],
    });

    if (!newShop) {
      return null;
    }

    // create private key, public key
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'pkcs1',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs1',
        format: 'pem',
      },
    });
    console.log(privateKey, '---', publicKey);

    const publicKeyString = await KeyTokenService.createKeyToken({
      userId: newShop._id,
      publicKey: publicKey.toString(),
      privateKey: privateKey.toString(),
    });

    if (!publicKeyString) {
      throw new BusinessLogicError('Error: publicKeyString error');
    }
    console.log('publicKeyString:: ', publicKeyString);

    // create pub
    const publicKeyObject = await crypto.createPublicKey(publicKeyString);
    console.log('publicKeyObject:: ', publicKeyObject);

    // created token pair
    const tokens = await createTokenPair(
      {
        userId: newShop._id,
        email,
      },
      publicKeyObject,
      privateKey
    );

    console.log('Created token success:: ', tokens);
    // apiKey
    const newKey = await apiKeyModel.create({
      key: crypto.randomBytes(64).toString('hex'),
      permission: ['0000'],
    });

    return {
      shop: getInfoData({
        fields: ['_id', 'name', 'email'],
        object: newShop,
      }),
      tokens,
      key: newKey,
    };
  };
}

module.exports = new AccessService();
