import { CreateLoggy } from "../src";

const debugLoggy = CreateLoggy({
  identifier: "test",
  color: true,
});

debugLoggy.log(
  "This just a log message, nothing too critical. Will always show up",
);
debugLoggy.info("Info is about as informative as a log message, right?");
debugLoggy.warn("This is a warning message be careful ahead.");
debugLoggy.error("An error occurred while processing the request.");

const warnLoggy = CreateLoggy({
  identifier: "test",
  color: true,
});

warnLoggy.log("This just a log message, nothing too critical.");
warnLoggy.info("Info will be treated the same as log, or should it?");
warnLoggy.warn("This is a warning message be careful ahead.");
warnLoggy.error("An error occurred while processing the request.");

const errorLoggy = CreateLoggy({
  identifier: "test",
  color: true,
});

errorLoggy.log("This just a log message, nothing too critical.");
errorLoggy.info("Info will be treated the same as log, or should it?");
errorLoggy.warn("This is a warning message be careful ahead.");
errorLoggy.error("An error occurred while processing the request.");

const noColorLoggy = CreateLoggy({
  identifier: "test",
  color: false,
  compact: false,
});

noColorLoggy.log("This is a log with no color.");
noColorLoggy.log("This message contains a tag but with no color.", {
  key: "value",
});

const loggy = CreateLoggy({
  identifier: "test",
  color: true,
  compact: false,
});

loggy.log("This message contains a tag.", { key: "value" });
loggy.log("This message contains multiple tags.", {
  key: "value",
  key2: "value2",
});
loggy.warn("This is a warning message containing multiple tags.", {
  key: "value",
  key2: "value2",
  key3: "value3",
});
loggy.error("This is an error message containing multiple tags.", {
  key: "value",
  key2: "value2",
  key3: "value3",
  key4: "value4",
});
loggy.log("This message contains nested objects in the tags.", {
  key: "value",
  user: {
    id: 123,
    name: "John Doe",
    details: {
      age: 30,
      address: {
        city: "New York",
        zip: "10001",
      },
    },
  },
});
