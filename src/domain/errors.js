class ValidationError extends Error {}
class NotFoundError extends Error {}
class ConflictError extends Error {}

module.exports = { ValidationError, NotFoundError, ConflictError };
