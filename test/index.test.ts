import { CreateLoggy } from "../src/index";

afterEach(() => {
  jest.restoreAllMocks();
});

test("successfully instantiates loggy", () => {
  const loggy = CreateLoggy({
    identifier: "test",
    color: true,
    timestamp: false,
  });

  expect(loggy).toBeDefined();
  expect(loggy.log).toBeDefined();
  expect(loggy.info).toBeDefined();
  expect(loggy.warn).toBeDefined();
  expect(loggy.error).toBeDefined();
});

test("successfully prints a log message", () => {
  const logSpy = jest.spyOn(console, "log");
  const loggy = CreateLoggy({
    identifier: "test",
    color: false,
    timestamp: false,
  });

  loggy.log("This is a log message");

  expect(logSpy).toHaveBeenCalledWith("[LOG] test: This is a log message");
});

test("successfully prints an info message", () => {
  const infoSpy = jest.spyOn(console, "info");
  const loggy = CreateLoggy({
    identifier: "test",
    color: false,
    timestamp: false,
  });

  loggy.info("This is a log message");

  expect(infoSpy).toHaveBeenCalledWith("[INFO] test: This is a log message");
});

test("successfully prints a warn message", () => {
  const warnSpy = jest.spyOn(console, "warn");
  const loggy = CreateLoggy({
    identifier: "test",
    color: false,
    timestamp: false,
  });

  loggy.warn("This is a warn message");

  expect(warnSpy).toHaveBeenCalledWith("[WARN] test: This is a warn message");
});

test("successfully prints an error message", () => {
  const errorSpy = jest.spyOn(console, "error");
  const loggy = CreateLoggy({
    identifier: "test",
    color: false,
    timestamp: false,
  });

  loggy.error("This is an error message");

  expect(errorSpy).toHaveBeenCalledWith(
    "[ERROR] test: This is an error message",
  );
});

test("logs an info message and 2 warn messages but only prints info because of log level", () => {
  const infoSpy = jest.spyOn(console, "info");
  const loggy = CreateLoggy({
    identifier: "test",
    color: false,
    timestamp: false,
  });

  loggy.info("This is an info message");
  loggy.warn("This is a warn message");
  loggy.warn("This is a warn message");

  expect(infoSpy).toHaveBeenCalledWith("[INFO] test: This is an info message");
});

test("logs a warn message and 2 error messages but only prints warn because of log level", () => {
  const warnSpy = jest.spyOn(console, "warn");
  const loggy = CreateLoggy({
    identifier: "test",
    color: false,
    timestamp: false,
  });

  loggy.warn("This is a warn message");
  loggy.error("This is an error message");
  loggy.error("This is an error message");

  expect(warnSpy).toHaveBeenCalledWith("[WARN] test: This is a warn message");
});

test("logs only error messages because of log level", () => {
  const errorSpy = jest.spyOn(console, "error");
  const loggy = CreateLoggy({
    identifier: "test",
    color: false,
    timestamp: false,
  });

  loggy.info("This is an info message");
  loggy.warn("This is a warn message");
  loggy.error("This is an error message");

  expect(errorSpy).toHaveBeenCalledWith(
    "[ERROR] test: This is an error message",
  );
});

test("logs only log messages and warn messages because of log level", () => {
  const logSpy = jest.spyOn(console, "log");
  const warnSpy = jest.spyOn(console, "warn");
  const loggy = CreateLoggy({
    identifier: "test",
    color: false,
    timestamp: false,
  });

  loggy.log("This is a log message");
  loggy.info("This is an info message");
  loggy.warn("This is a warn message");
  loggy.error("This is an error message");

  expect(logSpy).toHaveBeenCalledWith("[LOG] test: This is a log message");
  expect(warnSpy).toHaveBeenCalledWith("[WARN] test: This is a warn message");
});
