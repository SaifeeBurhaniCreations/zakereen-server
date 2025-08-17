const router = require('express').Router();
const { validatePassword, hashPassword, verifyToken, authGroup } = require('../utils/auth');
const userClient = require('../models/users')
const groupClient = require('../models/group')
const jwt = require('jsonwebtoken')
const { allowedRoles, roles_for_group } = require('../utils/validateUtils'); // Import allowed roles
require('dotenv').config()


router.get('/me', verifyToken, async (req, res) => {

    try {
        const { userId } = req
        const user = await userClient.findOne({ userid: userId }); 
        
        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }
        return res.status(200).json(user);
    } catch (error) {
        console.error("Error fetching user details:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
});

router.get('/', authGroup, async (req, res) => {
    try {
        const users = await userClient.find();
        // const filteredUsers = users.filter(user => user?._id.toString() !== req.user._id.toString());

        return res.status(200).json(users);
    } catch (error) {
        console.error("Error fetching user count:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
});

router.get('/fetch/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params
        const user = await userClient.findOne({ _id: id });
        return res.status(200).json(user);
    } catch (error) {
        console.error("Error fetching user count:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
});

router.get('/count', async (req, res) => {
    try {
        const count = await userClient.countDocuments(); // Get total user count
        return res.status(200).json({ count });
    } catch (error) {
        console.error("Error fetching user count:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
});

router.get('/count/:group', async (req, res) => {
    const { group } = req.params; // Get the group from the request parameters
    try {
        const count = await userClient.countDocuments({ belongsto: group }); // Count users belonging to the specified group
        return res.status(200).json({ count });
    } catch (error) {
        console.error("Error fetching user count:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
});

router.delete('/remove/:id', authGroup, async (req, res) => {
    const { id } = req.params;
    const { admin } = req.body;
    const creator = req.user;

    try {
        // Permissions check
        if (
            !roles_for_group.includes(creator.role) ||
            (creator.role === 'member' && req.body.role !== 'member')
        ) {
            return res.status(403).json({ error: "You do not have permission to perform this action." });
        }

        // Fetch user to delete
        const userToDelete = await userClient.findOne({ userid: id });
        if (!userToDelete) {
            return res.status(404).json({ error: "User not found." });
        }

        const { belongsto, _id: userObjectId } = userToDelete;

        let group = null;

        // Only fetch group if user belongs to one
        if (belongsto) {
            group = await groupClient.findOne({ name: belongsto });
        }

        // Remove user from group.members
        if (group) {
            await groupClient.updateOne(
                { name: belongsto },
                { $pull: { members: userObjectId } }
            );

            // If admin replacement is provided, validate and update
            if (admin) {
                const newAdmin = await userClient.findById(admin);
                if (newAdmin && newAdmin.role === 'member') {
                    newAdmin.role = 'groupadmin';
                    await newAdmin.save();
                }

                await groupClient.updateOne(
                    { name: belongsto },
                    { $set: { admin } }
                );
            }
        }

        // Finally, delete the user
        const deletionResult = await userClient.deleteOne({ userid: id });
        if (deletionResult.deletedCount === 0) {
            return res.status(500).json({ error: "Failed to delete user." });
        }

        const updatedUsers = await userClient.find()
        const updatedGroups = await groupClient.find()

        return res.status(200).json({ user: updatedUsers, group: updatedGroups });

    } catch (error) {
        console.error("Error deleting user:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
});

router.post("/authentication/login", async (req, res) => {
    let { userid, userpass } = req.body;
    
    if (!userid || !userpass) {
        return res.status(400).json({ error: "Username and password are required." });
    }

    const ITS = Number(userid)

    try {
        const response_login_find = await userClient.findOne({ userid: ITS });

        if (!response_login_find) {
            return res.status(401).json({ error: "Username or password is not valid." });
        }
        
        const user = response_login_find;
        
        if (typeof userpass !== 'string' || typeof user.userpass !== 'string') {
            return res.status(400).json({ error: "Invalid password format" });
        }

        const passwordMatch = await validatePassword(userpass, user.userpass);
        if (!passwordMatch) {
            return res.status(401).json({ error: "Username or password is not valid." });
        }

        if (!process.env.JWT_SECRET) {
            console.error("JWT_SECRET is not defined in environment variables.");
            return res.status(500).json({ error: "Server configuration error." });
        }
        const token = jwt.sign({ userid: user.userid }, process.env.JWT_SECRET);
        return res.status(200).json({ token });
    } catch (error) {
        console.error("Error during authentication:", error);
        return res.status(500).json({ error: "Internal server error, please try again later." });
    }
});

router.post('/create', authGroup, async (req, res) => {
    try {
        const creator = req.user;
        const { fullname, phone, userid, belongsto, role } = req.body;

        // Validate roles
        if (!roles_for_group.includes(creator.role) || (creator.role === 'member' && role !== 'member')) {
            return res.status(403).json({ error: "You do not have permission to create this user." });
        }

        // Check required fields
        if (!fullname || !phone || !userid || !belongsto || !role) {
            return res.status(400).json({ error: "All required fields (fullname, phone, userid, belongsto, role) must be provided." });
        }

        // Check for existing user
        const existingUser = await userClient.findOne({
            $or: [{ fullname }, { phone }, { userid }]
        });

        if (existingUser) {
            return res.status(400).json({ error: "A user with the same fullname, phone, or userid already exists." });
        }

        // Check if group exists
        const group = await groupClient.findOne({ name: belongsto });
        if (!group) {
            return res.status(400).json({ error: "Group does not exist." });
        }

        // Hash password (use userid as default password)
        const hashedPass = await hashPassword(String(userid));

        // Create new user
        const newUser = new userClient({
            ...req.body,
            userpass: hashedPass,
            createdat: new Date(),
            updatedat: new Date(),
        });

        await newUser.save();

        // Handle role-specific group updates
        if (role !== 'member') {
            const groupAdminData = await userClient.findById(group.admin);

            // Demote previous group admin if needed
            if (groupAdminData && groupAdminData.role === 'groupadmin') {
                groupAdminData.role = 'member';
                await groupAdminData.save();
            }

            group.admin = newUser._id;
            await group.save();
        }

        await groupClient.updateOne(
            { name: belongsto },
            { $addToSet: { members: newUser._id } } // use $addToSet to prevent duplicates
        );

        return res.status(201).json({
            message: "User created successfully.",
            user: newUser
        });

    } catch (error) {
        console.error("Error creating user:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
});

router.patch('/update/:userid', verifyToken, async (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1]; // Extract token from header
    if (!token) {
        return res.status(401).json({ error: "Token is required." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const updater = await userClient.findOne({ userid: decoded.userid }); // Find the updater's details
        if (!updater) {
            return res.status(404).json({ error: "Updater not found." });
        }

        // Check if the updater has permission to update the user
        if (!allowedRoles.includes(updater.role)) {
            return res.status(403).json({ error: "You do not have permission to update this user." });
        }

        const { userid } = req.params; // Get the userid from the request parameters
        const userToUpdate = await userClient.findOne({ userid }); // Find the user to update
        if (!userToUpdate) {
            return res.status(404).json({ error: "User not found." });
        }

        // Validate uniqueness of fullname, email, phone, and userid
        const { fullname, email, phone } = req.body;
        const existingUser = await userClient.findOne({
            $or: [
                { fullname, userid: { $ne: userid } },
                { email, userid: { $ne: userid } },
                { phone, userid: { $ne: userid } }
            ]
        });
        if (existingUser) {
            return res.status(400).json({ error: "User with the same fullname, email, or phone already exists." });
        }

        // Update the user with the provided data
        Object.assign(userToUpdate, req.body); // Update user fields with request body
        userToUpdate.updatedat = Date.now(); // Update the timestamp

        await userToUpdate.save(); // Save the updated user to the database
        return res.status(200).json({ message: "User updated successfully.", user: userToUpdate });
    } catch (error) {
        console.error("Error updating user:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
});

module.exports = router