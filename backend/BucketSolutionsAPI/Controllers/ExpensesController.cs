using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System;
using System.Collections.Generic;
using System.Security.Claims;

namespace BucketSolutionsAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ExpensesController : ControllerBase
    {
        private readonly string connString;
        private readonly ILogger<ExpensesController> _logger;

        public ExpensesController(IConfiguration config, ILogger<ExpensesController> logger)
        {
            connString = config.GetConnectionString("DefaultConnection")
                ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection is not configured.");
            _logger = logger;
        }

        public class ExpenseRequest
        {
            public string? Description { get; set; }
            public decimal Amount { get; set; }
            public string? AddedBy { get; set; }
        }

        [HttpGet]
        public IActionResult GetExpenses([FromQuery] string startDate, [FromQuery] string endDate)
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string sql = @"
                        SELECT * FROM Expenses 
                        WHERE CAST(ExpenseDate AS DATE) >= ISNULL(@Start, DATEADD(day, -30, GETDATE()))
                        AND CAST(ExpenseDate AS DATE) <= ISNULL(@End, GETDATE())
                        ORDER BY ExpenseDate DESC";

                    var list = new List<object>();
                    using (SqlCommand cmd = new SqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@Start", string.IsNullOrEmpty(startDate) ? DBNull.Value : (object)startDate);
                        cmd.Parameters.AddWithValue("@End", string.IsNullOrEmpty(endDate) ? DBNull.Value : (object)endDate);

                        using (SqlDataReader r = cmd.ExecuteReader())
                        {
                            while (r.Read())
                            {
                                // Added DBNull checks so old data doesn't crash the API!
                                list.Add(new
                                {
                                    id = r["ExpenseID"],
                                    description = r["Description"] != DBNull.Value ? r["Description"].ToString() : "N/A",
                                    amount = r["Amount"] != DBNull.Value ? Convert.ToDecimal(r["Amount"]) : 0m,
                                    date = r["ExpenseDate"],
                                    addedBy = r["AddedBy"] != DBNull.Value ? r["AddedBy"].ToString() : "Unknown",
                                    status = r["Status"] != DBNull.Value ? r["Status"].ToString() : "Approved"
                                });
                            }
                        }
                    }
                    return Ok(list);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to fetch expenses for range {StartDate} to {EndDate}", startDate, endDate);
                return StatusCode(500, "Something went wrong on our end. Please try again.");
            }
        }

        [HttpPost]
        public IActionResult AddExpense([FromBody] ExpenseRequest req)
        {
            if (req == null || string.IsNullOrEmpty(req.Description) || req.Amount <= 0)
                return BadRequest("Invalid expense data.");

            // SECURITY FIX: this used to trust a client-supplied `req.Role` field to
            // decide whether the expense was auto-approved — any caller could send
            // {"Role": "Admin"} regardless of who they actually were and get instant
            // approval. Role now comes from the verified auth token instead.
            string role = User.FindFirst(ClaimTypes.Role)?.Value ?? "";
            string status = (role == "Admin") ? "Approved" : "Pending";

            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string sql = "INSERT INTO Expenses (Description, Amount, AddedBy, UserRole, Status) VALUES (@D, @A, @By, @R, @S)";
                    using (SqlCommand cmd = new SqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@D", req.Description);
                        cmd.Parameters.AddWithValue("@A", req.Amount);
                        cmd.Parameters.AddWithValue("@By", req.AddedBy ?? "Unknown");
                        cmd.Parameters.AddWithValue("@R", string.IsNullOrEmpty(role) ? "Cashier" : role);
                        cmd.Parameters.AddWithValue("@S", status);
                        cmd.ExecuteNonQuery();
                    }
                }
                return Ok(new { message = $"Expense recorded. Status: {status}" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to add expense: {Description}", req.Description);
                return StatusCode(500, "Something went wrong on our end. Please try again.");
            }
        }

        // Restricted to Admin — this is what actually moves an expense from
        // Pending to Approved/Rejected, so it shouldn't be callable by anyone
        // who merely knows the URL.
        [Authorize(Roles = "Admin")]
        [HttpPut("{id}/status")]
        public IActionResult UpdateStatus(int id, [FromBody] string newStatus)
        {
            if (string.IsNullOrEmpty(newStatus)) return BadRequest("Status is required.");

            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string sql = "UPDATE Expenses SET Status = @S WHERE ExpenseID = @ID";
                    using (SqlCommand cmd = new SqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@S", newStatus);
                        cmd.Parameters.AddWithValue("@ID", id);
                        cmd.ExecuteNonQuery();
                    }
                }
                return Ok();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to update status for expense {ExpenseId}", id);
                return StatusCode(500, "Something went wrong on our end. Please try again.");
            }
        }
    }
}