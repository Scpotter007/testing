if (process.env.SUPPRESS_TEST_LOGS === 'true') {
  console.log = jest.fn();
  console.error = jest.fn();
}
