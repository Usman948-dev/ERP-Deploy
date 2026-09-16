using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System;
using System.Collections.Generic;

namespace BucketSolutionsAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class SuppliersController : ControllerBase
    {
        private readonly string connString;
        private readonly ILogger<SuppliersController> _logger;

        public SuppliersController(IConfiguration config, ILogger<SuppliersController> logger)
        {
            connString = config.GetConnectionString("DefaultConnection")
                ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection is not configured.");
            _logger = logger;
        }

        public class SupplierDto
        {
            public string? Name { get; set; }
            public string? ContactInfo { get; set; }
        }

        [HttpPost("add")]
        public IActionResult Add([FromBody] SupplierDto req)
        {
            if (req == null || string.IsNullOrEmpty(req.Name)) return BadRequest("Supplier name is required.");
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    // FIXED: Using 'SupplierName' instead of 'Name'
                    string sql = "INSERT INTO Suppliers (SupplierName, ContactInfo) VALUES (@N, @C)";
                    using (SqlCommand cmd = new SqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@N", req.Name);
                        cmd.Parameters.AddWithValue("@C", req.ContactInfo ?? "");
                        cmd.ExecuteNonQuery();
                    }
                }
                return Ok(new { message = "Supplier added successfully!" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to add supplier {SupplierName}", req?.Name);
                return StatusCode(500, "Something went wrong on our end. Please try again.");
            }
        }

        [HttpGet("list")]
        public IActionResult GetList()
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    var list = new List<object>();
                    // FIXED: Using 'SupplierName' instead of 'Name'
                    string sql = "SELECT * FROM Suppliers ORDER BY SupplierName ASC";
                    using (SqlCommand cmd = new SqlCommand(sql, conn))
                    {
                        using (SqlDataReader r = cmd.ExecuteReader())
                        {
                            while (r.Read())
                            {
                                list.Add(new
                                {
                                    id = r["SupplierID"],
                                    // FIXED: Reading from 'SupplierName'
                                    name = r["SupplierName"],
                                    contactInfo = r["ContactInfo"] != DBNull.Value ? r["ContactInfo"] : ""
                                });
                            }
                        }
                    }
                    return Ok(list);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to list suppliers");
                return StatusCode(500, "Something went wrong on our end. Please try again.");
            }
        }
    }
}
