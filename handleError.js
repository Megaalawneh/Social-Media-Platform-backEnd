class AppErorr extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.statusCode = status;
  }
}
function handleAsyncError(fn) {
  return function (req, res, next) {
    fn(req, res, next).catch((e) => next(e));
  };
}
module.exports = { AppErorr, handleAsyncError };