import jwt from "jsonwebtoken";
import env from "../config/env.js";

export const generateAccessToken = (user) =>
  jwt.sign({ userId: user._id.toString(), role: user.role }, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessExpire
  });

export const generateRefreshToken = (user) =>
  jwt.sign(
    {
      userId: user._id.toString(),
      tokenType: "refresh"
    },
    env.jwtRefreshSecret,
    {
      expiresIn: env.jwtRefreshExpire
    }
  );

export const verifyAccessToken = (token) => jwt.verify(token, env.jwtAccessSecret);

export const verifyRefreshToken = (token) => jwt.verify(token, env.jwtRefreshSecret);

export const getRefreshTokenMaxAge = () => {
  const value = env.jwtRefreshExpire;
  const match = /^(\d+)([smhd])$/.exec(value);

  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return amount * multipliers[unit];
};
