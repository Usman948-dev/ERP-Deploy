using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System;

namespace BucketSolutionsAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly string connString = @"Server=sql-server,1433;Database=iMarkDB;User Id=sa;Password=Usman5138@;TrustServerCertificate=True;";

        // We use ? here to tell C# these might be empty, fixing the yellow CS8618 warnings!
        public class LoginReq
        {
            public string? Username { get; set; }
            public string? Password { get; set; }
        }

        [HttpPost("login")]
        public IActionResult Login([FromBody] LoginReq req)
        {
            // Capital U and Capital P to perfectly match the class above
            if (req == null || string.IsNullOrEmpty(req.Username) || string.IsNullOrEmpty(req.Password))
                return BadRequest("Missing credentials");

            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();

                    string sql = "SELECT FullName, UserRole FROM Users WHERE TRIM(Username) = @u AND TRIM(Password) = @p";

                    using (SqlCommand cmd = new SqlCommand(sql, conn))
                    {
                        // Capital U and Capital P here as well
                        cmd.Parameters.AddWithValue("@u", req.Username.Trim());
                        cmd.Parameters.AddWithValue("@p", req.Password.Trim());

                        using (SqlDataReader r = cmd.ExecuteReader())
                        {
                            if (r.Read())
                            {
                                return Ok(new
                                {
                                    name = r["FullName"].ToString(),
                                    role = r["UserRole"].ToString()
                                });
                            }
                        }
                    }
                }
                return Unauthorized("Invalid credentials");
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }
    }
}