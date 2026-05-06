using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System;
using System.Collections.Generic;

namespace BucketSolutionsAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TransfersController : ControllerBase
    {
        private readonly string connString = @"Server=localhost\SQLEXPRESS;Database=iMarkDB;Trusted_Connection=True;TrustServerCertificate=True;";

        // --- DATA MODELS ---
        public class TransferReq
        {
            public string ShopItem { get; set; }
            public int QtyNeeded { get; set; }
        }

        public class ApproveReq
        {
            public int TransferID { get; set; }
        }

        // --- ENDPOINT 1: REQUEST STOCK (Used by Shop) ---
        [HttpPost("request")]
        public IActionResult RequestStock([FromBody] TransferReq req)
        {
            if (req == null || req.QtyNeeded <= 0 || string.IsNullOrEmpty(req.ShopItem))
                return BadRequest("Invalid transfer data.");

            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string sql = "INSERT INTO StockTransfers (ItemName, Qty, RequestedBy, Status) VALUES (@I, @Q, @R, 'Pending')";
                    using (SqlCommand cmd = new SqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@I", req.ShopItem);
                        cmd.Parameters.AddWithValue("@Q", req.QtyNeeded);
                        // Using 'Shop Manager' as default requestor
                        cmd.Parameters.AddWithValue("@R", "Shop Manager");
                        cmd.ExecuteNonQuery();
                    }
                }
                return Ok(new { message = "Stock transfer requested successfully!" });
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }

        // --- ENDPOINT 2: GET REGISTRY LIST (Used by everyone) ---
        [HttpGet("list")]
        public IActionResult GetList()
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    var list = new List<object>();
                    string sql = "SELECT * FROM StockTransfers ORDER BY RequestDate DESC";

                    using (SqlCommand cmd = new SqlCommand(sql, conn))
                    {
                        using (SqlDataReader r = cmd.ExecuteReader())
                        {
                            while (r.Read())
                            {
                                list.Add(new
                                {
                                    id = r["TransferID"],
                                    item = r["ItemName"],
                                    qty = r["Qty"],
                                    requestedBy = r["RequestedBy"],
                                    status = r["Status"],
                                    date = r["RequestDate"]
                                });
                            }
                        }
                    }
                    return Ok(list);
                }
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }

        // --- ENDPOINT 3: APPROVE TRANSFER (Used by Admin/Warehouse) ---
        [HttpPost("approve")]
        public IActionResult ApproveTransfer([FromBody] ApproveReq req)
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    // Update the status from Pending to Completed
                    string sql = "UPDATE StockTransfers SET Status = 'Completed' WHERE TransferID = @ID";
                    using (SqlCommand cmd = new SqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@ID", req.TransferID);
                        cmd.ExecuteNonQuery();
                    }
                }
                return Ok(new { message = "Transfer approved! Stock moved to shop." });
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }
    }
}