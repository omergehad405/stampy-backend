const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Announcement title is required"],
      trim: true,
      maxlength: [150, "Title cannot exceed 150 characters"],
    },
    message: {
      type: String,
      required: [true, "Announcement message body is required"],
      trim: true,
      maxlength: [2000, "Message body cannot exceed 2000 characters"],
    },
    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Virtual alias 'body' and 'description' for message
announcementSchema.virtual("body").get(function () {
  return this.message;
});

announcementSchema.virtual("description").get(function () {
  return this.message;
});

// Virtual for ID serialization consistency
announcementSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    ret.description = ret.message;
    ret.body = ret.message;
    return ret;
  },
});

module.exports = mongoose.model("Announcement", announcementSchema);
