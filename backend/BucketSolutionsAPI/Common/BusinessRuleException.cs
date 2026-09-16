using System;

namespace BucketSolutionsAPI.Common
{
    // Throw this (instead of a plain Exception) for business-rule failures
    // where the message itself is safe to show the end user as-is — e.g.
    // "Insufficient stock", "Item not found", "Already approved". Controllers
    // catch this type separately from general Exception so they can return
    // the message directly for this case, while still hiding the details of
    // any genuinely unexpected failure (a raw SqlException, a null ref, etc.)
    // behind a generic message. See any controller's use of Exception vs.
    // BusinessRuleException in a transaction's catch blocks for the pattern.
    public class BusinessRuleException : Exception
    {
        public BusinessRuleException(string message) : base(message) { }
    }
}
