// Guard against code calling the real alert during tests.
global.alert = jest.fn();
