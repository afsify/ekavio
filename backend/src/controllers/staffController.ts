import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';

export const getStaff = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const staff = await User.find({ tenantId }).select('-password').sort({ createdAt: -1 });
    res.json({ success: true, data: staff });
  } catch (error) {
    console.error('Get Staff Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const addStaff = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tenantId, role: currentRole } = req.user!;
    if (currentRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden. Admin role required.' });
    }

    const { name, phone, password, role } = req.body;

    const existingUser = await User.findOne({ phone, tenantId });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Staff with this phone already exists in organization.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      tenantId,
      name,
      phone,
      password: hashedPassword,
      role: role || 'staff',
    });

    await newUser.save();

    const userObj = newUser.toObject();
    delete userObj.password;

    res.status(201).json({ success: true, data: userObj });
  } catch (error) {
    console.error('Add Staff Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const deleteStaff = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tenantId, role: currentRole } = req.user!;
    if (currentRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden. Admin role required.' });
    }

    const { id } = req.params;

    const userToDelete = await User.findById(id);
    if (!userToDelete) {
      return res.status(404).json({ success: false, message: 'Staff not found.' });
    }

    if (userToDelete.tenantId.toString() !== tenantId.toString()) {
      return res.status(403).json({ success: false, message: 'Forbidden. Cannot delete staff from another organization.' });
    }

    await User.findByIdAndDelete(id);

    res.json({ success: true, message: 'Staff deleted successfully.' });
  } catch (error) {
    console.error('Delete Staff Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
