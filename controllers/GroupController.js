const router = require('express').Router();
const { validatePassword, hashPassword, verifyToken, authAdmin, authGroup } = require('../utils/auth');
const groupClient = require('../models/group')
const userClient = require('../models/users')
const jwt = require('jsonwebtoken')
const { roles_for_group: allowedRoles } = require('../utils/validateUtils');
require('dotenv').config()

// New route to get all groups
router.get('/', verifyToken, async (req, res) => {
    try {
        const groups = await groupClient.find({});
        return res.status(200).json(groups);
    } catch (error) {
        console.error("Error getting all groups:", error);
        return res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

// New route to get group by ID
router.get('/:groupId', verifyToken, async (req, res) => {
    try {
        const { groupId } = req.params;
        const group = await groupClient.findById(groupId);

        if (!group) {
            return res.status(404).json({ message: 'Group not found.' });
        }

        return res.status(200).json(group);
    } catch (error) {
        console.error("Error getting group by ID:", error);
        return res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

// Create Group Route
router.post('/create', authAdmin, async (req, res) => {
    try {
        const { name, adminId, userDetails } = req.body;
        const creatorRole = req.user.role;

        if (!allowedRoles.includes(creatorRole)) {
        return res.status(403).json({ message: 'Access denied. Only authorized roles can create a group.' });
        }

        // Check for existing group
        const [existingGroup, existingUser] = await Promise.all([
            groupClient.findOne({ name }),
            userDetails ? userClient.findOne({
                $or: [
                    { fullname: userDetails.fullname },
                    { phone: userDetails.phone },
                    { userid: userDetails.userid }
                ]
            }) : null
        ]);

        if (existingGroup) {
            return res.status(400).json({ message: 'Group with this name already exists.' });
        }

        let groupAdmin;
        let createdUser = null;

        if (adminId) {
        const adminUser = await userClient.findById(adminId);
        if (!adminUser || !allowedRoles.includes(adminUser.role)) {
            return res.status(400).json({ message: 'Invalid admin ID. Must be an existing user with a valid role.' });
        }
            groupAdmin = adminId;
            createdUser = adminUser;
            adminUser.belongsto = name
            await adminUser.save()
        } else if (userDetails) {
            if (existingUser) {
                return res.status(400).json({ error: "User with the same fullname, phone, or userid already exists." });
            }

            const hashedPass = await hashPassword(String(userDetails.userid));

            const newUserPayload = {
                ...userDetails,
                belongsto: name,
                role: 'groupadmin',
                title: 'tipper',
                userpass: hashedPass,
            };

            createdUser = await userClient.create(newUserPayload);
            groupAdmin = createdUser._id;
        } else {
        return res.status(400).json({ message: 'Either adminId or userDetails must be provided.' });
        }

        const createGroup = {
            name,
            admin: groupAdmin,
            members: [String(groupAdmin)], 
        }

        // Create the group
        const newGroup = await groupClient.create(createGroup);

        return res.status(201).json({
            group: newGroup,
            ...(createdUser && { user: createdUser }),
        });

    } catch (error) {
        console.error("Error creating group:", error);
        return res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

// Update Group Route
router.put('/update/:groupId', authGroup, async (req, res) => {
    const { groupId } = req.params;
    const { name } = req.body;
    const creatorRole = req.user.role; // Get role from decoded token
    const group = await groupClient.findById(groupId);

    if (!group) {
        return res.status(404).json({ message: 'Group not found.' });
    }

    if (!allowedRoles.includes(creatorRole) && group.admin !== req.user.id) {
        return res.status(403).json({ message: 'Access denied. Only authorized roles or the assigned groupadmin can update this group.' });
    }

    group.name = name || group.name;
    await group.save();

    return res.status(200).json(group);
});

// Delete Group Route
router.delete('/remove/:groupId', authAdmin, async (req, res) => {
    const { groupId } = req.params;
    const creatorRole = req.user.role; // Get role from decoded token

    if (!allowedRoles.includes(creatorRole)) {
        return res.status(403).json({ message: 'Access denied. Only authorized roles can delete this group.' });
    }

    const group = await groupClient.findByIdAndDelete(groupId);
    if (!group) {
        return res.status(404).json({ message: 'Group not found.' });
    }

    return res.status(204).send();
});

// Transfer Group Admin Rights Route
router.post('/:groupId/transfer/role', authGroup, async (req, res) => {
    const { groupId } = req.params;
    const { newAdminId } = req.body;
    const creatorRole = req.user.role; // Get role from decoded token
    const group = await groupClient.findById(groupId);

    if (!group) {
        return res.status(404).json({ message: 'Group not found.' });
    }

    if (group.admin !== req.user.id && !allowedRoles.includes(creatorRole)) {
        return res.status(403).json({ message: 'Access denied. Only the current groupadmin or authorized roles can transfer rights.' });
    }

    const newAdminUser = await userClient.findById(newAdminId);
    if (!newAdminUser) {
        return res.status(400).json({ message: 'Invalid new admin ID. Must be an existing user with a valid role.' });
    }

    if (newAdminUser?.role === 'member') {
        newAdminUser.role = 'groupadmin'
        await newAdminUser.save();
    }

    // Change the old group admin's role to 'member'
    const oldAdminUser = await userClient.findById(group.admin);
    if (oldAdminUser) {
        oldAdminUser.role = 'member'; // Update the old admin's role
        await oldAdminUser.save(); // Save the changes
    }

    // Assign the new admin
    group.admin = newAdminId;
    await group.save();

    return res.status(200).json(group);
});

// Assign External User to Group Route
router.put('/:groupId/add/member', authGroup, async (req, res) => {
    const { groupId } = req.params;
    const { userId } = req.body;
    const creatorRole = req.user.role; // Get role from decoded token


    if (!allowedRoles.includes(creatorRole)) {
        return res.status(403).json({ message: 'Access denied. Only authorized roles can add members to this group.' });
    }

    const group = await groupClient.findById(groupId);

    if (!group) {
        return res.status(404).json({ message: 'Group not found.' });
    }

    if (group.members.includes(userId)) {
        console.log('User is already a member of this group.');
        return res.status(400).json({ message: 'User is already a member of this group.' });
    }

    const user = await userClient.findById(userId);

    if (!user || !['admin', 'groupadmin', 'member'].includes(user.role)) {
        return res.status(400).json({ message: 'Invalid user ID. Must be an existing user with role admin, groupadmin, or member.' });
    }

    if (group.admin && user.role === 'groupadmin') {
        console.log('Cannot assign groupadmin if the group already has one.');

        return res.status(400).json({ message: 'Cannot assign groupadmin if the group already has one.' });
    }

    group.members.push(userId);
    user.belongsto = group.name;
    await user.save();
    await group.save();

    return res.status(200).json(group);
});

// New route to transfer a user from one group to another
router.post('/:groupId/transfer/member', authGroup, async (req, res) => {
    const { groupId } = req.params;
    const { userId, newGroupId } = req.body;
    const creatorRole = req.user.role; // Get role from decoded token

    if (!allowedRoles.includes(creatorRole)) {
        return res.status(403).json({ message: 'Access denied. Only authorized roles can transfer members.' });
    }

    const group = await groupClient.findById(groupId);
    const newGroup = await groupClient.findById(newGroupId);
    const user = await userClient.findById(userId);

    if (!group || !newGroup) {
        return res.status(404).json({ message: 'Group not found.' });
    }

    if (!user || !group.members.includes(userId)) {
        return res.status(400).json({ message: 'User is not a member of this group.' });
    }

    // Remove user from the current group
    group.members = group.members.filter(member => member.toString() !== userId);
    await group.save();

    // Add user to the new group
    newGroup.members.push(userId);
    user.belongsto = newGroup.name;
    await user.save();
    await newGroup.save();

    return res.status(200).json(newGroup);
});

// New route to remove a user from a group
router.post('/:groupId/remove/member', authGroup, async (req, res) => {
    const { groupId } = req.params;
    const { userId } = req.body;
    const creatorRole = req.user.role; // Get role from decoded token

    if (!allowedRoles.includes(creatorRole)) {
        return res.status(403).json({ message: 'Access denied. Only authorized roles can remove members from this group.' });
    }

    const group = await groupClient.findById(groupId);
    const user = await userClient.findById(userId);

    if (!group) {
        return res.status(404).json({ message: 'Group not found.' });
    }

    if (!user || !group.members.includes(userId)) {
        return res.status(400).json({ message: 'User is not a member of this group.' });
    }

    // Remove user from the group
    group.members = group.members.filter(member => member.toString() !== userId);
    user.belongsto = '';
    await user.save();
    await group.save();

    return res.status(204).send();
});


module.exports = router;
