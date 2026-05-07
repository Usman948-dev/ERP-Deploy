using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System;
using System.Collections.Generic;

namespace BucketSolutionsAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ExpensesController : ControllerBase
    {
        private readonly string connString = @"Server=sql-server,1433;Database=iMarkDB;User Id=sa;Password=Usman5138@;TrustServerCertificate=True;";

        public class ExpenseRequest
        {
            public string Description { get; set; }
            public decimal Amount { get; set; }
            public string AddedBy { get; set; }
            public string Role { get; set; }
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
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }

        [HttpPost]
        public IActionResult AddExpense([FromBody] ExpenseRequest req)
        {
            if (req == null || string.IsNullOrEmpty(req.Description) || req.Amount <= 0)
                return BadRequest("Invalid expense data.");

            string status = (req.Role == "Admin") ? "Approved" : "Pending";

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
                        cmd.Parameters.AddWithValue("@R", req.Role ?? "Cashier");
                        cmd.Parameters.AddWithValue("@S", status);
                        cmd.ExecuteNonQuery();
                    }
                }
                return Ok(new { message = $"Expense recorded. Status: {status}" });
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }

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
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }
    }
}