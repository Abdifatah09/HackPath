const request = require("supertest");
const app = require("../app");

jest.mock("../models", () => ({
  User: {
    findOne: jest.fn(),
    create: jest.fn(),
    findByPk: jest.fn()
  },
  Profile: {},
  RefreshToken: {
    create: jest.fn()
  }
}));

jest.mock("../utils/emailService", () => ({
  sendOtpEmail: jest.fn()
}));

jest.mock("../utils/tokenUtils", () => ({
  generateAccessToken: jest.fn(() => "fakeAccessToken"),
  generateRefreshToken: jest.fn(() => "fakeRefreshToken"),
  refreshTokenExpiryDate: jest.fn(() => new Date(Date.now() + 86400000))
}));

jest.mock("bcrypt", () => ({
  hash: jest.fn(() => "hashedPassword"),
  compare: jest.fn()
}));

const { User, RefreshToken } = require("../models");
const bcrypt = require("bcrypt");

describe("Auth routes", () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });


  it("should register a new user", async () => {

    User.findOne.mockResolvedValue(null);

    const fakeUser = {
      email: "test@test.com",
      update: jest.fn()
    };

    User.create.mockResolvedValue(fakeUser);

    const res = await request(app)
      .post("/auth/register")
      .send({
        email: "test@test.com",
        password: "Password123",
        name: "Test User"
      });

    expect(res.statusCode).toBe(201);
    expect(User.create).toHaveBeenCalled();
    expect(res.body.user.email).toBe("test@test.com");
    expect(res.body.accessToken).toBe("fakeAccessToken");
    expect(RefreshToken.create).toHaveBeenCalled();
  });


  it("should reject duplicate email", async () => {

    User.findOne.mockResolvedValue({ id: 1 });

    const res = await request(app)
      .post("/auth/register")
      .send({
        email: "test@test.com",
        password: "Password123",
        name: "Test User"
      });

    expect(res.statusCode).toBe(409);
  });


  it("should login successfully", async () => {

    User.findOne.mockResolvedValue({
      id: 1,
      email: "test@test.com",
      name: "Test User",
      role: "student",
      passwordHash: "hashedPassword"
    });

    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app)
      .post("/auth/login")
      .send({
        email: "test@test.com",
        password: "Password123"
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.accessToken).toBe("fakeAccessToken");
    expect(res.body.refreshToken).toBe("fakeRefreshToken");
  });


  it("should reject invalid password", async () => {

    User.findOne.mockResolvedValue({
      passwordHash: "hashedPassword"
    });

    bcrypt.compare.mockResolvedValue(false);

    const res = await request(app)
      .post("/auth/login")
      .send({
        email: "test@test.com",
        password: "wrongPassword"
      });

    expect(res.statusCode).toBe(401);
  });


});